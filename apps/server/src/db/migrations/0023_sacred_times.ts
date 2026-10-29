// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Scheduling by Shabbat and holidays (docs/phases/20-shabbat-holiday-scheduling.md): the
  // organization's place and method (validated by the shared sacredSettingsSchema; null: not
  // set), and the condition of a schedule entry. Playlist item windows are jsonb already.
  await sql`ALTER TABLE organizations ADD COLUMN sacred_settings jsonb`.execute(db);
  await sql`
    ALTER TABLE schedule_entries
      ADD COLUMN sacred text CHECK (sacred IN ('only', 'skip'))`.execute(db);
}
