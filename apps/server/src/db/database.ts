import { Kysely, PostgresDialect, sql } from 'kysely';
import type pg from 'pg';
import type { Database } from './schema.js';
import * as m0001 from './migrations/0001_auth_orgs.js';
import * as m0002 from './migrations/0002_media.js';
import * as m0003 from './migrations/0003_screens_playlists.js';
import * as m0004 from './migrations/0004_layouts_widgets.js';
import * as m0005 from './migrations/0005_item_fit.js';
import * as m0006 from './migrations/0006_media_source.js';
import * as m0007 from './migrations/0007_schedules.js';

export type Db = Kysely<Database>;

// pg returns bigint (int8) as string by default; keep it that way to avoid precision loss.

export function createDb(pool: pg.Pool): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export interface Migration {
  // Migrations must not depend on the current table types (they describe the past),
  // so they receive an untyped instance, as recommended by Kysely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  up(db: Kysely<any>): Promise<void>;
}

/**
 * Ordered, append-only list. Never edit or reorder an applied migration; add a new one.
 * Bundled statically so migrations work from the compiled, read-only image.
 */
export const MIGRATIONS: readonly (readonly [name: string, migration: Migration])[] = [
  ['0001_auth_orgs', m0001],
  ['0002_media', m0002],
  ['0003_screens_playlists', m0003],
  ['0004_layouts_widgets', m0004],
  ['0005_item_fit', m0005],
  ['0006_media_source', m0006],
  ['0007_schedules', m0007],
];

/**
 * Applies pending migrations, each in its own transaction, under a database-wide
 * advisory lock so concurrent server instances cannot race. Tracking lives in the
 * connection's current schema (search_path); no catalog-wide introspection is used.
 */
export async function migrateToLatest(
  db: Db,
  migrations: readonly (readonly [string, Migration])[] = MIGRATIONS,
): Promise<string[]> {
  return db.connection().execute(async (conn) => {
    await sql`SELECT pg_advisory_lock(hashtext('rubinny-migrations'))`.execute(conn);
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`.execute(conn);
      const { rows } = await sql<{ name: string }>`SELECT name FROM schema_migrations`.execute(
        conn,
      );
      const applied = new Set(rows.map((row) => row.name));

      const known = new Set(migrations.map(([name]) => name));
      const unknown = [...applied].filter((name) => !known.has(name));
      if (unknown.length > 0) {
        throw new Error(`Database has migrations unknown to this version: ${unknown.join(', ')}`);
      }

      const ran: string[] = [];
      for (const [name, migration] of migrations) {
        if (applied.has(name)) continue;
        try {
          await conn.transaction().execute(async (trx) => {
            await migration.up(trx);
            await sql`INSERT INTO schema_migrations (name) VALUES (${name})`.execute(trx);
          });
        } catch (error) {
          throw new Error(`Database migration failed at ${name}`, { cause: error });
        }
        ran.push(name);
      }
      return ran;
    } finally {
      await sql`SELECT pg_advisory_unlock(hashtext('rubinny-migrations'))`.execute(conn);
    }
  });
}
