// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Named groups of screens ("Floor 2"), to give many screens the same content at once
  // (docs/phases/13-next-plan.md). A screen may be in several groups.
  await sql`
    CREATE TABLE screen_groups (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE UNIQUE INDEX screen_groups_org_name_key ON screen_groups (org_id, lower(name))`.execute(
    db,
  );
  await sql`
    CREATE TABLE screen_group_members (
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      group_id uuid NOT NULL REFERENCES screen_groups (id) ON DELETE CASCADE,
      screen_id uuid NOT NULL REFERENCES screens (id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, screen_id)
    )`.execute(db);
  await sql`CREATE INDEX screen_group_members_screen_idx ON screen_group_members (screen_id)`.execute(
    db,
  );

  // Row-level security like every organization table (see 0011).
  const hasRole = await sql<{ exists: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rubinny_tenant') AS exists`.execute(db);
  for (const table of ['screen_groups', 'screen_group_members']) {
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
