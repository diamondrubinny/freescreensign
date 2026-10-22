// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Emergency and urgent notices shown over everything on the organization's screens.
  await sql`
    CREATE TABLE alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      style text NOT NULL CHECK (style IN ('emergency', 'notice')),
      title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
      message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
      -- NULL: every screen of the organization.
      screen_ids uuid[] CHECK (screen_ids IS NULL OR cardinality(screen_ids) BETWEEN 1 AND 1000),
      starts_at timestamptz NOT NULL DEFAULT now(),
      ends_at timestamptz,
      ended_at timestamptz,
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      ended_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (ends_at IS NULL OR ends_at > starts_at)
    )`.execute(db);
  await sql`CREATE INDEX alerts_org_active_idx ON alerts (org_id) WHERE ended_at IS NULL`.execute(
    db,
  );
  await sql`CREATE INDEX alerts_org_created_idx ON alerts (org_id, created_at DESC)`.execute(db);
}
