import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Media } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { FileTooLargeError, HashingCounter, sniffStream } from '../../lib/sniff.js';
import type { Storage } from '../../lib/storage.js';
import { parse } from '../../lib/validation.js';
import { displayName, sanitizeFilename } from '../../media/names.js';
import { sendStoredFile } from '../../media/serve.js';
import { ACCEPTED_TYPES } from '../../media/types.js';
import type { MediaQueue } from '../../queue.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { nameSchema } from '../auth/schemas.js';
import { notifyMediaScreens } from '../screens/notify.js';

const mediaParams = z.object({ orgId: z.uuid(), mediaId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const MULTIPART_OVERHEAD = 64 * 1024;
const PAGE_SIZE = 30;

export function mediaDto(row: Media, orgId: string) {
  const ready = row.status === 'ready';
  const base = `/api/v1/orgs/${orgId}/media/${row.id}`;
  return {
    id: row.id,
    name: row.name,
    originalFilename: row.original_filename,
    kind: row.kind,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    status: row.status,
    failureReason: row.failure_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(ready
      ? { fileUrl: `${base}/file`, thumbnailUrl: row.thumbnail_key ? `${base}/thumbnail` : null }
      : {}),
  };
}

function encodeCursor(row: Pick<Media, 'created_at' | 'id'>): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Invalid cursor', [
      { path: 'cursor', reason: 'invalid' },
    ]);
  }
  return { createdAt, id };
}

/** Escapes LIKE wildcards so user search text is matched literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function mediaRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  media: { storage: Storage; queue: MediaQueue },
) {
  const { storage, queue } = media;
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  const maxUpload = Math.max(ctx.env.MEDIA_MAX_IMAGE_BYTES, ctx.env.MEDIA_MAX_VIDEO_BYTES);

  async function usedBytes(orgId: string, excludeId?: string): Promise<number> {
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

  function assertQuota(used: number, adding: number) {
    const quota = ctx.env.MEDIA_ORG_QUOTA_BYTES;
    if (quota > 0 && used + adding > quota) {
      throw new HttpError(403, 'QUOTA_EXCEEDED', 'Storage quota exceeded');
    }
  }

  async function loadMedia(orgId: string, mediaId: string): Promise<Media> {
    const row = await ctx.db
      .selectFrom('media')
      .selectAll()
      .where('id', '=', mediaId)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  // ------------------------------------------------------------------ upload
  app.post('/api/v1/orgs/:orgId/media', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.mediaUploadUser, user.id);

    const declared = Number(request.headers['content-length'] ?? 0);
    if (declared > maxUpload + MULTIPART_OVERHEAD) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'File is too large', [
        { path: 'file', reason: 'too_large' },
      ]);
    }
    assertQuota(await usedBytes(org.id), Math.max(0, declared - MULTIPART_OVERHEAD));

    if (!request.isMultipart()) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected multipart/form-data');
    }
    const file = await request.file({
      limits: { fileSize: maxUpload, files: 1, fields: 0, parts: 1, fieldSize: 1024 },
    });
    if (!file) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'A file is required', [
        { path: 'file', reason: 'required' },
      ]);
    }

    const { mime, stream } = await sniffStream(file.file);
    const accepted = mime ? ACCEPTED_TYPES[mime] : undefined;
    if (!mime || !accepted) {
      stream.resume(); // drain the request
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'This file type is not supported', [
        { path: 'file', reason: 'unsupported_type' },
      ]);
    }

    const limit =
      accepted.kind === 'image' ? ctx.env.MEDIA_MAX_IMAGE_BYTES : ctx.env.MEDIA_MAX_VIDEO_BYTES;
    const id = randomUUID();
    const quarantineKey = `${org.id}/${id}`;
    const originalFilename = sanitizeFilename(file.filename);
    await ctx.db
      .insertInto('media')
      .values({
        id,
        org_id: org.id,
        name: displayName(originalFilename),
        original_filename: originalFilename,
        kind: accepted.kind,
        mime,
        status: 'uploading',
        quarantine_key: quarantineKey,
        created_by: user.id,
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
      if (file.file.truncated) throw new FileTooLargeError();
      assertQuota(await usedBytes(org.id, id), counter.bytes);
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
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'media',
      targetId: id,
      meta: { kind: accepted.kind, sizeBytes: counter.bytes },
    });
    return reply.status(202).send({ media: mediaDto(row, org.id) });
  });

  // -------------------------------------------------------------------- list
  app.get('/api/v1/orgs/:orgId/media', viewer, async (request) => {
    const org = requireOrg(request);
    const query = parse(
      z.object({
        kind: z.enum(['image', 'video']).optional(),
        q: z.string().trim().max(100).optional(),
        cursor: z.string().max(200).optional(),
      }),
      request.query,
    );
    let q = ctx.db
      .selectFrom('media')
      .selectAll()
      .where('org_id', '=', org.id)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(PAGE_SIZE + 1);
    if (query.kind) q = q.where('kind', '=', query.kind);
    if (query.q) q = q.where(sql<boolean>`name ILIKE ${likePattern(query.q)} ESCAPE '\\'`);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      q = q.where((eb) =>
        eb.or([
          eb('created_at', '<', cursor.createdAt),
          eb.and([eb('created_at', '=', cursor.createdAt), eb('id', '<', cursor.id)]),
        ]),
      );
    }
    const rows = await q.execute();
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return {
      media: page.map((row) => mediaDto(row, org.id)),
      nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
    };
  });

  app.get('/api/v1/orgs/:orgId/media-usage', viewer, async (request) => {
    const org = requireOrg(request);
    return {
      usedBytes: await usedBytes(org.id),
      quotaBytes: ctx.env.MEDIA_ORG_QUOTA_BYTES || null,
      maxImageBytes: ctx.env.MEDIA_MAX_IMAGE_BYTES,
      maxVideoBytes: ctx.env.MEDIA_MAX_VIDEO_BYTES,
    };
  });

  app.get('/api/v1/orgs/:orgId/media/:mediaId', viewer, async (request) => {
    const org = requireOrg(request);
    const { mediaId } = parse(mediaParams, request.params);
    return { media: mediaDto(await loadMedia(org.id, mediaId), org.id) };
  });

  // ------------------------------------------------------------ file access
  app.get('/api/v1/orgs/:orgId/media/:mediaId/file', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const { mediaId } = parse(mediaParams, request.params);
    const row = await loadMedia(org.id, mediaId);
    if (row.status !== 'ready' || !row.storage_key) throw notFound();
    return sendStoredFile(storage, request, reply, {
      key: row.storage_key,
      size: Number(row.size_bytes),
      contentType: row.mime,
      filename: row.original_filename,
      etag: row.sha256,
      cacheControl: 'private, max-age=3600',
    });
  });

  app.get('/api/v1/orgs/:orgId/media/:mediaId/thumbnail', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const { mediaId } = parse(mediaParams, request.params);
    const row = await loadMedia(org.id, mediaId);
    if (row.status !== 'ready' || !row.thumbnail_key) throw notFound();
    const head = await storage.get(storage.config.mediaBucket, row.thumbnail_key);
    void reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=86400')
      .header('content-length', String(head.contentLength))
      .header('content-security-policy', "default-src 'none'; sandbox");
    return reply.send(head.body);
  });

  // ---------------------------------------------------------- rename/delete
  app.patch('/api/v1/orgs/:orgId/media/:mediaId', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { mediaId } = parse(mediaParams, request.params);
    const { name } = parse(z.object({ name: nameSchema }), request.body);
    await loadMedia(org.id, mediaId);
    const row = await ctx.db
      .updateTable('media')
      .set({ name: sanitizeFilename(name).slice(0, 200), updated_at: new Date() })
      .where('id', '=', mediaId)
      .where('org_id', '=', org.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'media.renamed',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'media',
      targetId: mediaId,
    });
    return { media: mediaDto(row, org.id) };
  });

  app.delete('/api/v1/orgs/:orgId/media/:mediaId', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { mediaId } = parse(mediaParams, request.params);
    await loadMedia(org.id, mediaId);
    await ctx.db
      .updateTable('media')
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where('id', '=', mediaId)
      .where('org_id', '=', org.id)
      .execute();
    await notifyMediaScreens(ctx, mediaId);
    await queue.enqueue({ type: 'delete', mediaId });
    await audit(ctx.db, {
      action: 'media.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'media',
      targetId: mediaId,
    });
    return reply.status(204).send();
  });
}
