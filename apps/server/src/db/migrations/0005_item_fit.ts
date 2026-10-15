import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // How a media item fills its zone (ignored for widgets).
  await sql`
    ALTER TABLE playlist_items
      ADD COLUMN fit text NOT NULL DEFAULT 'contain' CHECK (fit IN ('contain', 'cover', 'blur'))
  `.execute(db);
}
