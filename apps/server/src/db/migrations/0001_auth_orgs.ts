// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// Migrations use raw SQL so the schema is explicit and reviewable.
// Tables are created in the connection's current search_path schema.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      name text NOT NULL,
      password_hash text NOT NULL,
      email_verified_at timestamptz,
      locale text NOT NULL DEFAULT 'he',
      mfa_secret_enc bytea,
      mfa_pending_secret_enc bytea,
      mfa_enabled_at timestamptz,
      mfa_last_step bigint,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
      CONSTRAINT users_name_length CHECK (char_length(name) BETWEEN 1 AND 200)
    )`.execute(db);
  await sql`CREATE UNIQUE INDEX users_email_key ON users (email)`.execute(db);

  await sql`
    CREATE TABLE recovery_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      code_hash text NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX recovery_codes_user_idx ON recovery_codes (user_id)`.execute(db);

  await sql`
    CREATE TABLE sessions (
      id_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      absolute_expires_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      ip_hmac text,
      user_agent text
    )`.execute(db);
  await sql`CREATE INDEX sessions_user_idx ON sessions (user_id)`.execute(db);
  await sql`CREATE INDEX sessions_expires_idx ON sessions (expires_at)`.execute(db);

  await sql`
    CREATE TABLE user_tokens (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'mfa_challenge')),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX user_tokens_user_purpose_idx ON user_tokens (user_id, purpose)`.execute(
    db,
  );
  await sql`CREATE INDEX user_tokens_expires_idx ON user_tokens (expires_at)`.execute(db);

  await sql`
    CREATE TABLE organizations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      require_admin_mfa boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )`.execute(db);

  await sql`
    CREATE TABLE memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT memberships_org_user_key UNIQUE (org_id, user_id)
    )`.execute(db);
  await sql`CREATE INDEX memberships_user_idx ON memberships (user_id)`.execute(db);

  await sql`
    CREATE TABLE invitations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      email text NOT NULL CHECK (email = lower(email)),
      role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
      token_hash text NOT NULL UNIQUE,
      invited_by uuid REFERENCES users (id) ON DELETE SET NULL,
      delivered_by_email boolean NOT NULL,
      expires_at timestamptz NOT NULL,
      accepted_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX invitations_org_idx ON invitations (org_id)`.execute(db);

  await sql`
    CREATE TABLE audit_logs (
      id bigserial PRIMARY KEY,
      org_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
      actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
      action text NOT NULL,
      target_type text,
      target_id text,
      ip_hmac text,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX audit_logs_org_created_idx ON audit_logs (org_id, created_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id)`.execute(db);
  await sql`CREATE INDEX audit_logs_created_idx ON audit_logs (created_at)`.execute(db);
}
