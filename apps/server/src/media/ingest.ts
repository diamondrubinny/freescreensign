import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { sql } from 'kysely';
import type { AppContext } from '../context.js';
import type { Media } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { HttpError } from '../lib/http-error.js';
import { FileTooLargeError, HashingCounter, sniffStream } from '../lib/sniff.js';
import type { Storage } from '../lib/storage.js';
import type { MediaQueue } from '../queue.js';
import { displayName, sanitizeFilename } from './names.js';
import { ACCEPTED_TYPES } from './types.js';

export interface IngestInput {
  orgId: string;
  userId: string;
  filename: string;
  stream: Readable;
  /** Display name (defaults to one derived from the file name). */
  name?: string;
  sourceUrl?: string;
  attribution?: string;
  /** Allowed kinds (e.g. stock imports accept images only). */
  kinds?: readonly ('image' | 'video')[];
  /** Reports a transport-level truncation (multipart size limit). */
  truncated?: () => boolean;
}

/**
 * The single entry point for new media: verifies the type by content, streams the
 * file into the quarantine bucket with size and quota checks, then queues it for
 * malware scanning and processing. Nothing is servable until the worker is done.
 */
export async function ingestMedia(
  ctx: AppContext,
  media: { storage: Storage; queue: MediaQueue },
  input: IngestInput,
): Promise<Media> {
  const { storage, queue } = media;
  const { mime, stream } = await sniffStream(input.stream);
  const accepted = mime ? ACCEPTED_TYPES[mime] : undefined;
  if (!mime || !accepted || (input.kinds && !input.kinds.includes(accepted.kind))) {
    stream.resume(); // drain
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'This file type is not supported', [
      { path: 'file', reason: 'unsupported_type' },
    ]);
  }

  const limit =
    accepted.kind === 'image' ? ctx.env.MEDIA_MAX_IMAGE_BYTES : ctx.env.MEDIA_MAX_VIDEO_BYTES;
  const id = randomUUID();
  const quarantineKey = `${input.orgId}/${id}`;
  const originalFilename = sanitizeFilename(input.filename);
  await ctx.db
    .insertInto('media')
    .values({
      id,
      org_id: input.orgId,
      name: (input.name?.trim() || displayName(originalFilename)).slice(0, 200),
      original_filename: originalFilename,
      kind: accepted.kind,
      mime,
      status: 'uploading',
      quarantine_key: quarantineKey,
      created_by: input.userId,
      source_url: input.sourceUrl ?? null,
      attribution: input.attribution ?? null,
    })
    .execute();

  const counter = new HashingCounter(limit);
  stream.on('error', (err) => counter.destroy(err));
  const discard = async () => {
    await storage.delete(storage.config.quarantineBucket, quarantineKey).catch(() => undefined);
    await ctx.db.deleteFrom('media').where('id', '=', id).execute();
  };

  try {
    await storage.put(
      storage.config.quarantineBucket,
      quarantineKey,
      stream.pipe(counter),
      'application/octet-stream',
    );
    if (input.truncated?.()) throw new FileTooLargeError();
    assertQuota(ctx, await usedBytes(ctx, input.orgId, id), counter.bytes);
  } catch (error) {
    stream.resume();
    await discard();
    if (error instanceof FileTooLargeError || counter.bytes > limit) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'File is too large', [
        { path: 'file', reason: 'too_large' },
      ]);
    }
    throw error;
  }

  const row = await ctx.db
    .updateTable('media')
    .set({
      status: 'queued',
      size_bytes: counter.bytes,
      sha256: counter.digest(),
      updated_at: new Date(),
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  await queue.enqueue({ type: 'process', mediaId: id });
  await audit(ctx.db, {
    action: 'media.uploaded',
    orgId: input.orgId,
    actorUserId: input.userId,
    targetType: 'media',
    targetId: id,
    meta: {
      kind: accepted.kind,
      sizeBytes: counter.bytes,
      ...(input.sourceUrl ? { source: 'stock' } : {}),
    },
  });
  return row;
}

/** Bytes used by an organization's live media (blocked and failed files don't count). */
export async function usedBytes(ctx: AppContext, orgId: string, excludeId?: string) {
  let query = ctx.db
    .selectFrom('media')
    .select(sql<string>`coalesce(sum(size_bytes), 0)`.as('total'))
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['blocked', 'failed']);
  if (excludeId) query = query.where('id', '!=', excludeId);
  const row = await query.executeTakeFirstOrThrow();
  return Number(row.total);
}

export function assertQuota(ctx: AppContext, used: number, adding: number) {
  const quota = ctx.env.MEDIA_ORG_QUOTA_BYTES;
  if (quota > 0 && used + adding > quota) {
    throw new HttpError(403, 'QUOTA_EXCEEDED', 'Storage quota exceeded');
  }
}
