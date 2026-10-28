// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Meeting rooms and their bookings (docs/phases/18-rooms-directory-calendar-zmanim.md).
  // btree_gist lets one constraint cover "same room" (=) and "overlapping time" (&&), so two
  // bookings can never overlap, even when they are made at the same moment.
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`.execute(db);
  } catch (error) {
    throw new Error(
      'Rubinny needs the PostgreSQL extension btree_gist (part of the standard contrib modules). ' +
        'Ask the database administrator to run "CREATE EXTENSION btree_gist;" in this database, ' +
        'then start the server again (see docs/UPGRADING.md).',
      { cause: error },
    );
  }

  await sql`
    CREATE TABLE rooms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      location text CHECK (char_length(location) <= 120),
      capacity integer CHECK (capacity BETWEEN 1 AND 1000),
      show_titles boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE UNIQUE INDEX rooms_org_name_key ON rooms (org_id, lower(name))`.execute(db);

  await sql`
    CREATE TABLE room_bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      during tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
      title text CHECK (char_length(title) <= 120),
      -- Null when booked at a screen (no person is recorded), or after the user is deleted.
      booked_by uuid REFERENCES users (id) ON DELETE SET NULL,
      screen_id uuid REFERENCES screens (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at),
      CHECK (ends_at - starts_at <= interval '12 hours'),
      CONSTRAINT room_bookings_no_overlap EXCLUDE USING gist (room_id WITH =, during WITH &&)
    )`.execute(db);
  await sql`CREATE INDEX room_bookings_org_starts_idx ON room_bookings (org_id, starts_at)`.execute(
    db,
  );
  await sql`CREATE INDEX room_bookings_ends_idx ON room_bookings (ends_at)`.execute(db);

  // The organization's PIN for booking at a screen (Argon2id, like passwords); null = off.
  await sql`ALTER TABLE organizations ADD COLUMN room_pin_hash text`.execute(db);

  // Row-level security like every organization table (see 0011).
  const hasRole = await sql<{ exists: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rubinny_tenant') AS exists`.execute(db);
  for (const table of ['rooms', 'room_bookings']) {
    if (hasRole.rows[0]?.exists) {
      await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ${sql.table(table)} TO rubinny_tenant`.execute(
        db,
      );
    }
    await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`
      CREATE POLICY tenant_isolation ON ${sql.table(table)} TO rubinny_tenant
        USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
        WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid)`.execute(db);
  }
}
