// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Where an imported file came from (e.g. a free stock library) and its credit line.
  await sql`
    ALTER TABLE media
      ADD COLUMN source_url text CHECK (source_url IS NULL OR char_length(source_url) <= 2000),
      ADD COLUMN attribution text CHECK (attribution IS NULL OR char_length(attribution) <= 500)
  `.execute(db);
}
