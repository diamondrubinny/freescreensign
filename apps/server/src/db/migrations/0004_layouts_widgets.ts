// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE widgets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      type text NOT NULL CHECK (type ~ '^[a-z][a-z0-9-]{0,63}$'),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX widgets_org_idx ON widgets (org_id)`.execute(db);

  await sql`
    CREATE TABLE layouts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      width integer NOT NULL CHECK (width BETWEEN 1 AND 16384),
      height integer NOT NULL CHECK (height BETWEEN 1 AND 16384),
      background text NOT NULL DEFAULT '#000000' CHECK (background ~ '^#[0-9a-fA-F]{6}$'),
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX layouts_org_idx ON layouts (org_id)`.execute(db);

  await sql`
    CREATE TABLE layout_zones (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      layout_id uuid NOT NULL REFERENCES layouts (id) ON DELETE CASCADE,
      position integer NOT NULL CHECK (position >= 0),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
      x integer NOT NULL CHECK (x >= 0),
      y integer NOT NULL CHECK (y >= 0),
      w integer NOT NULL CHECK (w > 0),
      h integer NOT NULL CHECK (h > 0),
      z integer NOT NULL DEFAULT 0 CHECK (z BETWEEN 0 AND 100),
      playlist_id uuid REFERENCES playlists (id) ON DELETE SET NULL,
      CONSTRAINT layout_zones_position_key UNIQUE (layout_id, position)
    )`.execute(db);
  await sql`CREATE INDEX layout_zones_playlist_idx ON layout_zones (playlist_id)`.execute(db);

  // A playlist item is either a media item or a widget, never both.
  await sql`ALTER TABLE playlist_items ALTER COLUMN media_id DROP NOT NULL`.execute(db);
  await sql`
    ALTER TABLE playlist_items
      ADD COLUMN widget_id uuid REFERENCES widgets (id) ON DELETE CASCADE,
      ADD CONSTRAINT playlist_items_one_ref CHECK (num_nonnulls(media_id, widget_id) = 1)
  `.execute(db);
  await sql`CREATE INDEX playlist_items_widget_idx ON playlist_items (widget_id)`.execute(db);

  // When set, the layout replaces the screen's single playlist.
  await sql`
    ALTER TABLE screens ADD COLUMN layout_id uuid REFERENCES layouts (id) ON DELETE SET NULL
  `.execute(db);
  await sql`CREATE INDEX screens_layout_idx ON screens (layout_id)`.execute(db);
}
