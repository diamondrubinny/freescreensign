// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE playlists (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX playlists_org_idx ON playlists (org_id)`.execute(db);

  await sql`
    CREATE TABLE playlist_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      playlist_id uuid NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
      position integer NOT NULL CHECK (position >= 0),
      media_id uuid NOT NULL REFERENCES media (id) ON DELETE CASCADE,
      duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 1000 AND 86400000),
      CONSTRAINT playlist_items_position_key UNIQUE (playlist_id, position)
    )`.execute(db);
  await sql`CREATE INDEX playlist_items_media_idx ON playlist_items (media_id)`.execute(db);

  await sql`
    CREATE TABLE screens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      token_hash text NOT NULL UNIQUE,
      playlist_id uuid REFERENCES playlists (id) ON DELETE SET NULL,
      orientation text NOT NULL DEFAULT 'landscape'
        CHECK (orientation IN ('landscape', 'portrait', 'landscape-flipped', 'portrait-flipped')),
      timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
      last_seen_at timestamptz,
      player_version text,
      resolution text,
      manifest_version text,
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX screens_org_idx ON screens (org_id)`.execute(db);
  await sql`CREATE INDEX screens_playlist_idx ON screens (playlist_id)`.execute(db);

  await sql`
    CREATE TABLE pairing_codes (
      code_hash text PRIMARY KEY,
      poll_token_hash text NOT NULL UNIQUE,
      screen_id uuid REFERENCES screens (id) ON DELETE CASCADE,
      device_token_enc bytea,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX pairing_codes_expires_idx ON pairing_codes (expires_at)`.execute(db);
}
