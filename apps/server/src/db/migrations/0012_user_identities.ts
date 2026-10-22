// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Accounts at an OpenID Connect provider linked to users (SSO). Matched by (issuer, subject):
  // the subject never changes, unlike the e-mail address.
  await sql`
    CREATE TABLE user_identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      issuer text NOT NULL CHECK (char_length(issuer) <= 500),
      subject text NOT NULL CHECK (char_length(subject) <= 255),
      -- The address when linked, for display only.
      email text NOT NULL CHECK (char_length(email) <= 320),
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (issuer, subject)
    )`.execute(db);
  await sql`CREATE INDEX user_identities_user_idx ON user_identities (user_id)`.execute(db);

  // False for accounts created through SSO until a password is set (password reset).
  await sql`ALTER TABLE users ADD COLUMN password_login boolean NOT NULL DEFAULT true`.execute(db);
}
