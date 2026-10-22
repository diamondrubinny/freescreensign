// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Offline e-mail alerts, per organization.
  await sql`
    ALTER TABLE organizations
      ADD COLUMN offline_alerts boolean NOT NULL DEFAULT false,
      ADD COLUMN offline_alert_minutes integer NOT NULL DEFAULT 10
        CHECK (offline_alert_minutes BETWEEN 5 AND 1440)
  `.execute(db);

  // What the player reports about itself (see the heartbeat).
  await sql`
    ALTER TABLE screens
      ADD COLUMN clock_offset_ms integer,
      ADD COLUMN current_layout_id text CHECK (char_length(current_layout_id) <= 64),
      ADD COLUMN now_playing jsonb,
      ADD COLUMN offline_alerted_at timestamptz
  `.execute(db);

  // Uptime: one bit per 5-minute slot of a UTC day (288 slots), set by heartbeats.
  await sql`
    CREATE TABLE screen_uptime_days (
      screen_id uuid NOT NULL REFERENCES screens (id) ON DELETE CASCADE,
      day date NOT NULL,
      slots bit(288) NOT NULL DEFAULT repeat('0', 288)::bit(288),
      PRIMARY KEY (screen_id, day)
    )`.execute(db);
  await sql`CREATE INDEX screen_uptime_days_day_idx ON screen_uptime_days (day)`.execute(db);

  // Proof of play. Ids come from the player, so retries never double count.
  await sql`
    CREATE TABLE play_events (
      id uuid PRIMARY KEY,
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      screen_id uuid NOT NULL REFERENCES screens (id) ON DELETE CASCADE,
      media_id uuid REFERENCES media (id) ON DELETE SET NULL,
      widget_id uuid REFERENCES widgets (id) ON DELETE SET NULL,
      content_kind text NOT NULL CHECK (content_kind IN ('media', 'widget')),
      content_name text NOT NULL CHECK (char_length(content_name) BETWEEN 1 AND 300),
      zone_id text NOT NULL CHECK (char_length(zone_id) BETWEEN 1 AND 64),
      started_at timestamptz NOT NULL,
      duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 86400000),
      received_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX play_events_org_started_idx ON play_events (org_id, started_at)`.execute(
    db,
  );
  await sql`CREATE INDEX play_events_screen_started_idx ON play_events (screen_id, started_at)`.execute(
    db,
  );
}
