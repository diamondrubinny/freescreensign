// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Reported by the player: where it runs and what its wrapper can do.
  await sql`
    ALTER TABLE screens
      ADD COLUMN platform text NOT NULL DEFAULT 'web'
        CHECK (platform IN ('web', 'electron', 'android')),
      ADD COLUMN capabilities text[] NOT NULL DEFAULT '{}',
      ADD COLUMN screenshot_request_id uuid,
      ADD COLUMN screenshot_requested_at timestamptz
  `.execute(db);

  // Only the latest screenshot per screen is kept (re-encoded, without metadata).
  await sql`
    CREATE TABLE screen_screenshots (
      screen_id uuid PRIMARY KEY REFERENCES screens (id) ON DELETE CASCADE,
      image bytea NOT NULL CHECK (octet_length(image) <= 8388608),
      width integer NOT NULL CHECK (width > 0),
      height integer NOT NULL CHECK (height > 0),
      taken_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX screen_screenshots_taken_idx ON screen_screenshots (taken_at)`.execute(db);
}
