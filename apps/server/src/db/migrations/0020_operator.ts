// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // The operator of the installation sees the server status page (docs/phases/13-next-plan.md).
  // First setup makes its user the operator; an existing installation gets its oldest user.
  // More operators only from the server's command line (deploy/set-operator.sh).
  await sql`ALTER TABLE users ADD COLUMN is_operator boolean NOT NULL DEFAULT false`.execute(db);
  await sql`
    UPDATE users SET is_operator = true
    WHERE id = (SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at, id LIMIT 1)
  `.execute(db);

  // Written by deploy/backup.sh after each backup; read by the status page. Not organization
  // data, and not readable by the tenant role.
  await sql`
    CREATE TABLE backup_runs (
      id bigserial PRIMARY KEY,
      finished_at timestamptz NOT NULL DEFAULT now(),
      size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
      encrypted boolean NOT NULL
    )`.execute(db);
}
