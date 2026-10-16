import { sql, type Kysely } from 'kysely';

/** Tables of one organization, by their org_id column. */
const ORG_TABLES = [
  'memberships',
  'invitations',
  'audit_logs',
  'media',
  'playlists',
  'screens',
  'widgets',
  'layouts',
  'schedules',
  'play_events',
  'alerts',
] as const;

/** Tables that belong to an organization through their parent row. */
const CHILD_TABLES = [
  ['playlist_items', 'playlist_id', 'playlists'],
  ['layout_zones', 'layout_id', 'layouts'],
  ['schedule_entries', 'schedule_id', 'schedules'],
  ['screen_uptime_days', 'screen_id', 'screens'],
  ['screen_screenshots', 'screen_id', 'screens'],
] as const;

/** Read only by organization requests; not organization data (short-lived, hashed codes). */
const SHARED_TABLES = ['pairing_codes'] as const;

const ORG = sql.raw(`nullif(current_setting('app.org_id', true), '')::uuid`);

/**
 * Row-level security as defense in depth (see docs/phases/10c-rls-arm64.md).
 *
 * Organization requests run in a transaction as the role rubinny_tenant, with app.org_id set
 * to the organization: whatever a query forgets, PostgreSQL only shows and accepts that
 * organization's rows. The connecting user owns the tables and is not affected, so system
 * work (players, the worker, sign-in) is unchanged. Sessions, tokens and recovery codes are
 * not readable by the tenant role at all.
 *
 * Creating a role needs the CREATEROLE privilege. Without it (some managed databases) the
 * policies are still created but never apply, the server logs a warning at startup, and
 * isolation stays enforced in code as before.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Migration in database.ts
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rubinny_tenant') THEN
        BEGIN
          CREATE ROLE rubinny_tenant NOLOGIN NOSUPERUSER NOINHERIT NOBYPASSRLS;
        EXCEPTION
          -- Created concurrently (e.g. by another schema's migration): fine.
          WHEN duplicate_object OR unique_violation THEN NULL;
          WHEN insufficient_privilege THEN
            RAISE WARNING 'rubinny: cannot create role rubinny_tenant; row-level security stays inactive';
            RETURN;
        END;
      END IF;
      IF NOT pg_has_role(current_user, 'rubinny_tenant', 'MEMBER') THEN
        BEGIN
          EXECUTE format('GRANT rubinny_tenant TO %I', current_user);
        EXCEPTION
          WHEN insufficient_privilege THEN
            RAISE WARNING 'rubinny: cannot grant rubinny_tenant; row-level security stays inactive';
        END;
      END IF;
    END
    $$`.execute(db);

  const hasRole = await sql<{ exists: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rubinny_tenant') AS exists`.execute(db);
  const tables = [
    ...ORG_TABLES,
    ...CHILD_TABLES.map(([table]) => table),
    ...SHARED_TABLES,
    'organizations',
    'users',
  ];
  if (hasRole.rows[0]?.exists) {
    const schema = sql.id(await currentSchema(db));
    await sql`GRANT USAGE ON SCHEMA ${schema} TO rubinny_tenant`.execute(db);
    // Identity columns (audit_logs.id, play_events.id) draw from sequences.
    await sql`GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${schema} TO rubinny_tenant`.execute(db);
    for (const table of tables) {
      await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ${sql.table(table)} TO rubinny_tenant`.execute(
        db,
      );
    }
  }

  for (const table of ORG_TABLES) {
    await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`
      CREATE POLICY tenant_isolation ON ${sql.table(table)} TO rubinny_tenant
        USING (org_id = ${ORG}) WITH CHECK (org_id = ${ORG})`.execute(db);
  }
  for (const [table, column, parent] of CHILD_TABLES) {
    // The parent is filtered by its own policy, so this sees only the organization's parents.
    const owned = sql`EXISTS (SELECT 1 FROM ${sql.table(parent)} p WHERE p.id = ${sql.ref(
      `${table}.${column}`,
    )})`;
    await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`
      CREATE POLICY tenant_isolation ON ${sql.table(table)} TO rubinny_tenant
        USING (${owned}) WITH CHECK (${owned})`.execute(db);
  }

  await sql`ALTER TABLE organizations ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation ON organizations TO rubinny_tenant
      USING (id = ${ORG}) WITH CHECK (id = ${ORG})`.execute(db);

  // Users: only members of the organization (memberships is itself filtered), read only.
  await sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`
    CREATE POLICY tenant_members ON users FOR SELECT TO rubinny_tenant
      USING (EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id))`.execute(db);
}

async function currentSchema(db: Kysely<unknown>): Promise<string> {
  const result = await sql<{ schema: string }>`SELECT current_schema() AS schema`.execute(db);
  return result.rows[0]?.schema ?? 'public';
}
