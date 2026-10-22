// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql } from 'kysely';
import type { Db } from '../../db/database.js';

/**
 * Screen uptime as one bit per 5-minute slot of a UTC day (288 slots). A heartbeat
 * (every 30 s) marks its slot, so a slot counts as online if the screen called in.
 */
export const SLOT_MS = 5 * 60 * 1000;
export const SLOTS_PER_DAY = 288;
const DAY_MS = 24 * 60 * 60 * 1000;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const slotOf = (ms: number) => Math.floor((ms % DAY_MS) / SLOT_MS);

/** Marks the slot of `at` as online. */
export async function recordUptime(db: Db, screenId: string, at = new Date()): Promise<void> {
  const ms = at.getTime();
  const slot = slotOf(ms);
  await sql`
    INSERT INTO screen_uptime_days (screen_id, day, slots)
    VALUES (${screenId}, ${utcDay(ms)}::date, set_bit(repeat('0', 288)::bit(288), ${slot}, 1))
    ON CONFLICT (screen_id, day)
      DO UPDATE SET slots = set_bit(screen_uptime_days.slots, ${slot}, 1)
  `.execute(db);
}

export interface UptimeSummary {
  /** Online fraction over the window (0–1), or null when the window has no tracked slots. */
  ratio: number | null;
  /** Online fraction per hour of the window, oldest first (null: no tracked slot in it). */
  hours: (number | null)[];
}

/**
 * Online fraction of the slots from `from` (or the screen's creation, if later) to `now`.
 * The current slot counts once the screen has called in during it (never as a gap).
 */
export async function uptimeSummary(
  db: Db,
  screen: { id: string; created_at: Date },
  from: Date,
  now = new Date(),
): Promise<UptimeSummary> {
  const rows = await db
    .selectFrom('screen_uptime_days')
    .select([sql<string>`day::text`.as('day'), sql<string>`slots::text`.as('slots')])
    .where('screen_id', '=', screen.id)
    .where('day', '>=', utcDay(from.getTime()))
    .execute();
  const days = new Map(rows.map((row) => [row.day, row.slots]));
  const online = (slotStart: number) =>
    days.get(utcDay(slotStart))?.charAt(slotOf(slotStart)) === '1';

  const first = Math.max(from.getTime(), screen.created_at.getTime());
  const start = Math.ceil(first / SLOT_MS) * SLOT_MS; // whole slots only
  const end = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS; // the current slot is still open

  // Hourly buckets from the window start: [from, from + 1h), … (for a small chart).
  const hourMs = 60 * 60 * 1000;
  const bucketCount = Math.ceil((now.getTime() - from.getTime()) / hourMs);
  const bucketUp = new Array<number>(bucketCount).fill(0);
  const bucketTotal = new Array<number>(bucketCount).fill(0);
  let up = 0;
  let total = 0;
  for (let slot = start; slot < end; slot += SLOT_MS) {
    const bucket = Math.min(bucketCount - 1, Math.floor((slot - from.getTime()) / hourMs));
    const isUp = online(slot);
    total++;
    bucketTotal[bucket] = (bucketTotal[bucket] ?? 0) + 1;
    if (isUp) {
      up++;
      bucketUp[bucket] = (bucketUp[bucket] ?? 0) + 1;
    }
  }
  // The current slot is still open: it counts only once the screen has called in during it.
  if (end + SLOT_MS > first && online(end)) {
    const bucket = Math.min(bucketCount - 1, Math.floor((end - from.getTime()) / hourMs));
    total++;
    up++;
    bucketTotal[bucket] = (bucketTotal[bucket] ?? 0) + 1;
    bucketUp[bucket] = (bucketUp[bucket] ?? 0) + 1;
  }
  const hours = bucketTotal.map((count, i) => (count === 0 ? null : (bucketUp[i] ?? 0) / count));
  return { ratio: total === 0 ? null : up / total, hours };
}
