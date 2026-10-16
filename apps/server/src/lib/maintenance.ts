import type { Db } from '../db/database.js';
import { pruneScreenshots } from '../modules/ops/screenshots.js';
import type { MediaQueue } from '../queue.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MaintenanceResult {
  sessions: number;
  tokens: number;
  invitations: number;
  auditLogs: number;
  uptimeDays: number;
  playEvents: number;
  screenshots: number;
}

/** Uptime history kept per screen. */
export const UPTIME_RETENTION_DAYS = 90;

/** Enforces retention: removes expired credentials and old audit entries. */
export async function runMaintenance(
  db: Db,
  auditRetentionDays: number,
  playRetentionDays = 90,
): Promise<MaintenanceResult> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const sessions = await db
    .deleteFrom('sessions')
    .where((eb) => eb.or([eb('expires_at', '<', now), eb('absolute_expires_at', '<', now)]))
    .executeTakeFirst();
  const tokens = await db
    .deleteFrom('user_tokens')
    .where((eb) => eb.or([eb('expires_at', '<', dayAgo), eb('used_at', '<', dayAgo)]))
    .executeTakeFirst();
  const invitations = await db
    .deleteFrom('invitations')
    .where('created_at', '<', new Date(now.getTime() - 30 * DAY_MS))
    .where('accepted_at', 'is', null)
    .executeTakeFirst();
  await db
    .deleteFrom('pairing_codes')
    .where('expires_at', '<', new Date(now.getTime() - DAY_MS))
    .execute();
  const auditLogs = await db
    .deleteFrom('audit_logs')
    .where('created_at', '<', new Date(now.getTime() - auditRetentionDays * DAY_MS))
    .executeTakeFirst();
  const uptimeDays = await db
    .deleteFrom('screen_uptime_days')
    .where(
      'day',
      '<',
      new Date(now.getTime() - UPTIME_RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10),
    )
    .executeTakeFirst();
  const playEvents = await db
    .deleteFrom('play_events')
    .where('started_at', '<', new Date(now.getTime() - playRetentionDays * DAY_MS))
    .executeTakeFirst();
  const screenshots = await pruneScreenshots(db, now);
  return {
    screenshots,
    uptimeDays: Number(uptimeDays.numDeletedRows),
    playEvents: Number(playEvents.numDeletedRows),
    sessions: Number(sessions.numDeletedRows),
    tokens: Number(tokens.numDeletedRows),
    invitations: Number(invitations.numDeletedRows),
    auditLogs: Number(auditLogs.numDeletedRows),
  };
}

/**
 * Uploads interrupted mid-stream stay in "uploading"; after an hour they are
 * soft-deleted and handed to the worker, which removes any partial objects.
 */
export async function cleanupStaleUploads(
  db: Db,
  queue: MediaQueue,
  olderThanMs = 60 * 60 * 1000,
): Promise<number> {
  const stale = await db
    .updateTable('media')
    .set({ deleted_at: new Date() })
    .where('status', '=', 'uploading')
    .where('deleted_at', 'is', null)
    .where('created_at', '<', new Date(Date.now() - olderThanMs))
    .returning('id')
    .execute();
  for (const { id } of stale) await queue.enqueue({ type: 'delete', mediaId: id });
  return stale.length;
}
