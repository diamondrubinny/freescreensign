// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';
import { PLAY_LIMITS, playEventSchema, type PlayEvent } from '@rubinny/shared';
import type { Db } from '../../db/database.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The upload envelope; events are validated one by one so a bad one cannot block the rest. */
export const playUploadSchema = z.object({
  events: z.array(z.unknown()).min(1).max(PLAY_LIMITS.batch),
});

/**
 * Stores proof-of-play events of a screen. Only content of the screen's organization is
 * kept, with its name at that time (reports stay readable after it is deleted). Invalid,
 * too old or future events are skipped; ids seen before are ignored (safe retries).
 */
export async function ingestPlays(
  db: Db,
  screen: { id: string; org_id: string },
  raw: readonly unknown[],
  now = new Date(),
): Promise<{ accepted: number; skipped: number }> {
  const oldest = now.getTime() - PLAY_LIMITS.maxAgeDays * DAY_MS;
  const newest = now.getTime() + PLAY_LIMITS.futureSkewMs;
  const events: PlayEvent[] = [];
  for (const item of raw) {
    const parsed = playEventSchema.safeParse(item);
    if (!parsed.success) continue;
    const started = Date.parse(parsed.data.startedAt);
    if (started < oldest || started > newest) continue;
    events.push(parsed.data);
  }

  const ids = (kind: 'media' | 'widget') => [
    ...new Set(events.filter((e) => e.kind === kind).map((e) => e.ref)),
  ];
  const mediaIds = ids('media');
  const widgetIds = ids('widget');
  const names = new Map<string, string>();
  if (mediaIds.length > 0) {
    const rows = await db
      .selectFrom('media')
      .select(['id', 'name'])
      .where('id', 'in', mediaIds)
      .where('org_id', '=', screen.org_id)
      .execute();
    for (const row of rows) names.set(`media:${row.id}`, row.name);
  }
  if (widgetIds.length > 0) {
    const rows = await db
      .selectFrom('widgets')
      .select(['id', 'name'])
      .where('id', 'in', widgetIds)
      .where('org_id', '=', screen.org_id)
      .execute();
    for (const row of rows) names.set(`widget:${row.id}`, row.name);
  }

  const values = events.flatMap((event) => {
    const name = names.get(`${event.kind}:${event.ref}`);
    if (name === undefined) return [];
    return [
      {
        id: event.id,
        org_id: screen.org_id,
        screen_id: screen.id,
        media_id: event.kind === 'media' ? event.ref : null,
        widget_id: event.kind === 'widget' ? event.ref : null,
        content_kind: event.kind,
        content_name: name.slice(0, 300),
        zone_id: event.zoneId,
        started_at: new Date(event.startedAt),
        duration_ms: event.durationMs,
      },
    ];
  });
  const inserted =
    values.length > 0
      ? await db
          .insertInto('play_events')
          .values(values)
          .onConflict((oc) => oc.column('id').doNothing())
          .executeTakeFirst()
      : null;
  const accepted = Number(inserted?.numInsertedOrUpdatedRows ?? 0);
  return { accepted, skipped: raw.length - accepted };
}
