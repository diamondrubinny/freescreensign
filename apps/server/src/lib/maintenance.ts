// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { Db } from '../db/database.js';
import { pruneWebhookDeliveries } from '../modules/integrations/delivery.js';
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
  roomBookings: number;
  webhookDeliveries: number;
}

/** Uptime history kept per screen. */
export const UPTIME_RETENTION_DAYS = 90;
export const ROOM_BOOKING_RETENTION_DAYS = 90;

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
  // An approval interrupted while applying (process restart): back to pending, so an admin
  // decides again (re-applying the same PUT/PATCH is harmless; a done DELETE reports stale).
  await db
    .updateTable('approval_requests')
    .set({ status: 'pending', decided_by: null, decided_at: null })
    .where('status', '=', 'applying')
    .where('decided_at', '<', new Date(now.getTime() - 15 * 60 * 1000))
    .execute();
  // Decided approval requests are kept 90 days (the decision stays in the audit log).
  await db
    .deleteFrom('approval_requests')
    .where('status', 'not in', ['pending', 'applying'])
    .where('decided_at', '<', new Date(now.getTime() - 90 * DAY_MS))
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
  // Room bookings are kept 90 days after they end (docs/phases/18-rooms-directory-calendar-zmanim.md).
  const roomBookings = await db
    .deleteFrom('room_bookings')
    .where('ends_at', '<', new Date(now.getTime() - ROOM_BOOKING_RETENTION_DAYS * DAY_MS))
    .executeTakeFirst();
  const screenshots = await pruneScreenshots(db, now);
  const webhookDeliveries = await pruneWebhookDeliveries(db);
  return {
    screenshots,
    uptimeDays: Number(uptimeDays.numDeletedRows),
    playEvents: Number(playEvents.numDeletedRows),
    sessions: Number(sessions.numDeletedRows),
    tokens: Number(tokens.numDeletedRows),
    invitations: Number(invitations.numDeletedRows),
    auditLogs: Number(auditLogs.numDeletedRows),
    roomBookings: Number(roomBookings.numDeletedRows),
    webhookDeliveries,
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
