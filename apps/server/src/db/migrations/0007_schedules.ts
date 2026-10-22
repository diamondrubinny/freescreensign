// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX schedules_org_idx ON schedules (org_id)`.execute(db);

  // Position is the priority: the entry nearest the top wins. Rules use the screen's wall clock.
  await sql`
    CREATE TABLE schedule_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      schedule_id uuid NOT NULL REFERENCES schedules (id) ON DELETE CASCADE,
      position integer NOT NULL CHECK (position >= 0),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      layout_id uuid REFERENCES layouts (id) ON DELETE CASCADE,
      playlist_id uuid REFERENCES playlists (id) ON DELETE CASCADE,
      date_from date,
      date_to date,
      days_of_week smallint[] NOT NULL DEFAULT '{}'
        CHECK (days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]),
      time_from text CHECK (time_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      time_to text CHECK (time_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
      enabled boolean NOT NULL DEFAULT true,
      CONSTRAINT schedule_entries_position_key UNIQUE (schedule_id, position),
      CONSTRAINT schedule_entries_one_content CHECK ((layout_id IS NULL) <> (playlist_id IS NULL)),
      CONSTRAINT schedule_entries_dates CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to),
      CONSTRAINT schedule_entries_times CHECK (
        (time_from IS NULL AND time_to IS NULL) OR (time_from IS NOT NULL AND time_to IS NOT NULL AND time_from <> time_to)
      )
    )`.execute(db);
  await sql`CREATE INDEX schedule_entries_layout_idx ON schedule_entries (layout_id)`.execute(db);
  await sql`CREATE INDEX schedule_entries_playlist_idx ON schedule_entries (playlist_id)`.execute(
    db,
  );

  await sql`
    ALTER TABLE screens ADD COLUMN schedule_id uuid REFERENCES schedules (id) ON DELETE SET NULL
  `.execute(db);
  await sql`CREATE INDEX screens_schedule_idx ON screens (schedule_id)`.execute(db);
}
