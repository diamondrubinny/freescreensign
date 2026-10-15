import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // Where an imported file came from (e.g. a free stock library) and its credit line.
  await sql`
    ALTER TABLE media
      ADD COLUMN source_url text CHECK (source_url IS NULL OR char_length(source_url) <= 2000),
      ADD COLUMN attribution text CHECK (attribution IS NULL OR char_length(attribution) <= 500)
  `.execute(db);
}
