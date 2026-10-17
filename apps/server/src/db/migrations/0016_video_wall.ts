import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  // A screen's place in a video wall (docs/phases/12-touch-wall-ai.md), validated by the API
  // with the shared schema: { columns, rows, column, row, bezelX, bezelY }.
  await sql`ALTER TABLE screens ADD COLUMN wall jsonb`.execute(db);
}
