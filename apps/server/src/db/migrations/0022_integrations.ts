// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Integrations (docs/phases/19-integrations-api-webhooks.md): organization API keys for
  // other systems, and webhooks that tell them what happened.
  await sql`
    CREATE TABLE api_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      -- The start of the key, to recognize it in lists (the key itself is never stored).
      prefix text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 10),
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz,
      last_used_at timestamptz,
      -- Shortened (/24 or /48), not the full address.
      last_used_ip text,
      revoked_at timestamptz
    )`.execute(db);
  await sql`CREATE INDEX api_keys_org_idx ON api_keys (org_id)`.execute(db);

  await sql`
    CREATE TABLE webhooks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      url text NOT NULL CHECK (char_length(url) <= 2000),
      events text[] NOT NULL CHECK (cardinality(events) BETWEEN 1 AND 20),
      -- Encrypted with a key derived from ENCRYPTION_KEY (it signs every delivery).
      secret_enc bytea NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      failure_count integer NOT NULL DEFAULT 0,
      disabled_reason text,
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX webhooks_org_idx ON webhooks (org_id)`.execute(db);

  await sql`
    CREATE TABLE webhook_deliveries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      webhook_id uuid NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
      event text NOT NULL,
      payload jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      claimed_until timestamptz,
      last_status_code integer,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      delivered_at timestamptz
    )`.execute(db);
  await sql`
    CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at)
      WHERE status = 'pending'`.execute(db);
  await sql`
    CREATE INDEX webhook_deliveries_webhook_idx ON webhook_deliveries (webhook_id, created_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX webhook_deliveries_created_idx ON webhook_deliveries (created_at)`.execute(
    db,
  );

  // Alerts started or ended by an integration name its key (no person).
  await sql`
    ALTER TABLE alerts
      ADD COLUMN created_by_key uuid REFERENCES api_keys (id) ON DELETE SET NULL,
      ADD COLUMN ended_by_key uuid REFERENCES api_keys (id) ON DELETE SET NULL`.execute(db);

  // Row-level security like every organization table (see 0011).
  const hasRole = await sql<{ exists: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rubinny_tenant') AS exists`.execute(db);
  for (const table of ['api_keys', 'webhooks', 'webhook_deliveries']) {
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
