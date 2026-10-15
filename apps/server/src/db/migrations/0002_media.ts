import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE media (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      original_filename text NOT NULL CHECK (char_length(original_filename) <= 255),
      kind text NOT NULL CHECK (kind IN ('image', 'video')),
      mime text NOT NULL,
      size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
      sha256 text,
      width integer,
      height integer,
      duration_ms integer,
      status text NOT NULL CHECK (status IN ('uploading', 'queued', 'processing', 'ready', 'blocked', 'failed')),
      failure_reason text,
      quarantine_key text,
      storage_key text,
      thumbnail_key text,
      created_by uuid REFERENCES users (id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )`.execute(db);
  await sql`CREATE INDEX media_org_created_idx ON media (org_id, created_at DESC) WHERE deleted_at IS NULL`.execute(
    db,
  );
  await sql`CREATE INDEX media_status_idx ON media (status, updated_at)`.execute(db);
}
