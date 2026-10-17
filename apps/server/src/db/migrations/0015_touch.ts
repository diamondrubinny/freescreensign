import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Touch screens (docs/phases/12-touch-wall-ai.md): a tap on a zone opens another layout of
  // the organization or goes back; after idle_seconds without a touch, scheduled content
  // returns. A deleted target leaves the zone without an action (the type stays, unused).
  await sql`
    ALTER TABLE layouts ADD COLUMN idle_seconds integer NOT NULL DEFAULT 60
      CHECK (idle_seconds BETWEEN 10 AND 600)`.execute(db);
  await sql`
    ALTER TABLE layout_zones
      ADD COLUMN action_type text CHECK (action_type IN ('layout', 'back')),
      ADD COLUMN action_layout_id uuid REFERENCES layouts (id) ON DELETE SET NULL,
      ADD COLUMN label text CHECK (char_length(label) <= 100)`.execute(db);
  await sql`CREATE INDEX layout_zones_action_layout_idx ON layout_zones (action_layout_id)
    WHERE action_layout_id IS NOT NULL`.execute(db);
}
