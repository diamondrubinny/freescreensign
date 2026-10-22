// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // When a playlist item is shown (docs/phases/13-next-plan.md), validated by the API with the
  // shared schema: { dateFrom, dateTo, daysOfWeek, timeFrom, timeTo }. Null: always.
  // ("window" is a reserved word in SQL.)
  await sql`
    ALTER TABLE playlist_items
      ADD COLUMN time_window jsonb CHECK (time_window IS NULL OR jsonb_typeof(time_window) = 'object')
  `.execute(db);
}
