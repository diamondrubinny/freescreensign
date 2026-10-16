import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // When on, editors' changes to what screens show wait for an admin (docs/phases/11b-approvals.md).
  await sql`ALTER TABLE organizations ADD COLUMN require_approval boolean NOT NULL DEFAULT false`.execute(
    db,
  );

  // A change that was checked (dry run) and waits for a decision. On approval the same
  // request runs again as the approving admin.
  await sql`
    CREATE TABLE approval_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      method text NOT NULL CHECK (method IN ('PUT', 'PATCH', 'DELETE')),
      path text NOT NULL CHECK (char_length(path) <= 500),
      body jsonb,
      summary jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
      requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
      requested_at timestamptz NOT NULL DEFAULT now(),
      decided_by uuid REFERENCES users (id) ON DELETE SET NULL,
      decided_at timestamptz,
      note text CHECK (char_length(note) <= 500)
    )`.execute(db);
  await sql`CREATE INDEX approval_requests_org_status_idx ON approval_requests (org_id, status, requested_at DESC)`.execute(
    db,
  );

  // Row-level security like every organization table (see 0011).
  const hasRole = await sql<{ exists: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rubinny_tenant') AS exists`.execute(db);
  if (hasRole.rows[0]?.exists) {
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON approval_requests TO rubinny_tenant`.execute(
      db,
    );
  }
  await sql`ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation ON approval_requests TO rubinny_tenant
      USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
      WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid)`.execute(db);
}
