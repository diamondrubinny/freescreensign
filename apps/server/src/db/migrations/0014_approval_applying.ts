// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // 'applying': an admin approved and the change is being applied. The claim commits before
  // the change runs, so the approval does not hold a connection (or a row lock) meanwhile.
  await sql`ALTER TABLE approval_requests DROP CONSTRAINT approval_requests_status_check`.execute(
    db,
  );
  await sql`
    ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_status_check
      CHECK (status IN ('pending', 'applying', 'approved', 'rejected', 'withdrawn'))`.execute(db);
}
