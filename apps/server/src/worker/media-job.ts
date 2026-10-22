// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { fileTypeFromFile } from 'file-type';
import type { Db } from '../db/database.js';
import { audit } from '../lib/audit.js';
import { scanStream } from '../lib/clamav.js';
import type { Storage } from '../lib/storage.js';
import { ACCEPTED_TYPES, type MediaFailureReason } from '../media/types.js';
import { MediaRejectedError, processImage, processVideo } from './processors.js';

export interface WorkerDeps {
  db: Db;
  storage: Storage;
  clamav: { host: string; port: number };
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function fail(
  deps: WorkerDeps,
  mediaId: string,
  status: 'blocked' | 'failed',
  reason: MediaFailureReason,
) {
  await deps.db
    .updateTable('media')
    .set({ status, failure_reason: reason, updated_at: new Date() })
    .where('id', '=', mediaId)
    .execute();
}

/**
 * Scans, verifies and sanitizes one uploaded file, then publishes it.
 * Transient errors (storage, scanner unavailable) are thrown for a retry;
 * MediaRejectedError marks the item as failed/blocked permanently.
 */
export async function processMediaJob(deps: WorkerDeps, mediaId: string): Promise<void> {
  const { db, storage, log } = deps;
  const row = await db.selectFrom('media').selectAll().where('id', '=', mediaId).executeTakeFirst();
  if (!row || row.deleted_at || !row.quarantine_key) return; // deleted meanwhile or already done
  if (row.status !== 'queued' && row.status !== 'processing') return;

  await db
    .updateTable('media')
    .set({ status: 'processing', updated_at: new Date() })
    .where('id', '=', mediaId)
    .execute();
  const workDir = await mkdtemp(join(tmpdir(), 'rubinny-media-'));
  const inputPath = join(workDir, 'input');
  try {
    await storage.download(storage.config.quarantineBucket, row.quarantine_key, inputPath);

    // 1. Malware scan first; nothing else touches the bytes before this passes.
    const verdict = await scanStream(createReadStream(inputPath), deps.clamav);
    if (!verdict.clean) {
      log.warn(
        { mediaId, orgId: row.org_id, signature: verdict.signature },
        'SECURITY: malware detected in upload',
      );
      await storage.delete(storage.config.quarantineBucket, row.quarantine_key);
      await db
        .updateTable('media')
        .set({
          status: 'blocked',
          failure_reason: 'malware_detected',
          quarantine_key: null,
          size_bytes: 0,
          updated_at: new Date(),
        })
        .where('id', '=', mediaId)
        .execute();
      await audit(db, {
        action: 'media.blocked',
        orgId: row.org_id,
        actorUserId: row.created_by,
        targetType: 'media',
        targetId: mediaId,
        meta: { signature: verdict.signature },
      });
      return;
    }

    // 2. Re-verify the real type from the stored bytes.
    const detected = await fileTypeFromFile(inputPath);
    const accepted = detected ? ACCEPTED_TYPES[detected.mime] : undefined;
    if (!detected || !accepted || accepted.kind !== row.kind)
      throw new MediaRejectedError('unsupported_type');

    // 3. Sanitize and extract metadata.
    const processed =
      accepted.kind === 'image'
        ? await processImage(inputPath, workDir, accepted.outputMime)
        : await processVideo(inputPath, workDir, accepted.outputExt as 'mp4' | 'webm');

    // 4. Publish to the media bucket.
    const storageKey = `${row.org_id}/${row.id}.${accepted.outputExt}`;
    const thumbnailKey = `${row.org_id}/${row.id}.thumb.webp`;
    const { size } = await stat(processed.outputPath);
    const sha256 = await sha256File(processed.outputPath);
    await storage.put(
      storage.config.mediaBucket,
      storageKey,
      createReadStream(processed.outputPath),
      accepted.outputMime,
    );
    await storage.put(
      storage.config.mediaBucket,
      thumbnailKey,
      createReadStream(processed.thumbnailPath),
      'image/webp',
    );
    await storage.delete(storage.config.quarantineBucket, row.quarantine_key);

    const updated = await db
      .updateTable('media')
      .set({
        status: 'ready',
        failure_reason: null,
        mime: accepted.outputMime,
        size_bytes: size,
        sha256,
        width: processed.width,
        height: processed.height,
        duration_ms: processed.durationMs,
        storage_key: storageKey,
        thumbnail_key: thumbnailKey,
        quarantine_key: null,
        updated_at: new Date(),
      })
      .where('id', '=', mediaId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (updated.numUpdatedRows === 0n) {
      // Deleted while processing: remove what we just published.
      await storage.delete(storage.config.mediaBucket, storageKey).catch(() => undefined);
      await storage.delete(storage.config.mediaBucket, thumbnailKey).catch(() => undefined);
    }
    log.info({ mediaId, kind: accepted.kind, size }, 'media ready');
  } catch (error) {
    if (error instanceof MediaRejectedError) {
      log.warn({ mediaId, reason: error.reason }, 'media rejected');
      await storage
        .delete(storage.config.quarantineBucket, row.quarantine_key)
        .catch(() => undefined);
      await fail(deps, mediaId, 'failed', error.reason);
      await db
        .updateTable('media')
        .set({ quarantine_key: null, size_bytes: 0 })
        .where('id', '=', mediaId)
        .execute();
      return;
    }
    throw error; // transient: BullMQ retries with backoff
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Removes every stored copy of a deleted item, then the row itself. */
export async function deleteMediaJob(deps: WorkerDeps, mediaId: string): Promise<void> {
  const { db, storage } = deps;
  const row = await db.selectFrom('media').selectAll().where('id', '=', mediaId).executeTakeFirst();
  if (!row) return;
  if (row.quarantine_key) await storage.delete(storage.config.quarantineBucket, row.quarantine_key);
  if (row.storage_key) await storage.delete(storage.config.mediaBucket, row.storage_key);
  if (row.thumbnail_key) await storage.delete(storage.config.mediaBucket, row.thumbnail_key);
  await db.deleteFrom('media').where('id', '=', mediaId).execute();
}

/** Marks items whose processing ultimately failed after all retries. */
export async function markProcessingError(db: Db, mediaId: string): Promise<void> {
  await db
    .updateTable('media')
    .set({ status: 'failed', failure_reason: 'processing_error', updated_at: new Date() })
    .where('id', '=', mediaId)
    .where('status', 'in', ['queued', 'processing'])
    .execute();
}
