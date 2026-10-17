import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Writing suggestions with the organization's own API key (opt-in, off by default; see
  // docs/phases/12-touch-wall-ai.md). The key is encrypted with the server's key ring; only
  // its last four characters are kept readable, to recognise it.
  await sql`
    ALTER TABLE organizations
      ADD COLUMN ai_key_enc bytea,
      ADD COLUMN ai_key_hint text CHECK (char_length(ai_key_hint) <= 4),
      ADD COLUMN ai_model text NOT NULL DEFAULT 'claude-opus-5-5'
        CHECK (ai_model IN ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
      ADD COLUMN ai_enabled_at timestamptz`.execute(db);
}
