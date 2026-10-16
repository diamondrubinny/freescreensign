import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../../src/context.js';
import { orgGuard } from '../../src/modules/auth/guards.js';
import {
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

/**
 * Row-level security (migration 0011, lib/tenant.ts): a query that forgets to filter by
 * organization must still see and change only the caller's organization.
 */
describe.runIf(integrationEnabled)('row-level security', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  /** A deliberately careless route: no organization filter anywhere. */
  function probeRoutes(app: FastifyInstance, ctx: AppContext) {
    app.get('/api/v1/orgs/:orgId/__probe', { preHandler: orgGuard(ctx, 'VIEWER') }, async () => {
      const who = await sql<{ role: string; org: string }>`
          SELECT current_user AS role, current_setting('app.org_id', true) AS org`.execute(ctx.db);
      const widgets = await ctx.db.selectFrom('widgets').select(['name', 'org_id']).execute();
      const users = await ctx.db.selectFrom('users').select('email').execute();
      const items = await ctx.db.selectFrom('playlist_items').select('id').execute();
      let sessions = 'readable';
      await ctx.db
        .transaction()
        .execute(async (trx) => trx.selectFrom('sessions').select('id_hash').execute())
        .catch((error: unknown) => {
          sessions = String((error as { code?: string }).code);
        });
      return { ...who.rows[0], widgets, users: users.map((u) => u.email), items, sessions };
    });
    app.post(
      '/api/v1/orgs/:orgId/__probe',
      { preHandler: orgGuard(ctx, 'EDITOR') },
      async (request) => {
        const { orgId } = request.body as { orgId: string };
        await ctx.db
          .insertInto('widgets')
          .values({ org_id: orgId, type: 'clock', name: 'planted', config: '{}' })
          .execute();
        return { inserted: true };
      },
    );
    app.delete('/api/v1/orgs/:orgId/__probe', { preHandler: orgGuard(ctx, 'EDITOR') }, async () => {
      const deleted = await ctx.db.deleteFrom('widgets').executeTakeFirst();
      return { deleted: Number(deleted.numDeletedRows) };
    });
  }

  async function twoOrgs() {
    h = await createHarness({}, { extraRoutes: probeRoutes });
    const orgA = await insertOrg(h.db, await insertUser(h.db, 'a@example.com'), 'A', false);
    const orgB = await insertOrg(h.db, await insertUser(h.db, 'b@example.com'), 'B', false);
    const a = await login(h.app, 'a@example.com');
    for (const [org, client] of [
      [orgA, a],
      [orgB, await login(h.app, 'b@example.com')],
    ] as const) {
      const res = await client.post(`/api/v1/orgs/${org}/widgets`, {
        type: 'clock',
        name: `Clock ${org === orgA ? 'A' : 'B'}`,
        config: {},
      });
      expect(res.statusCode, res.body).toBe(201);
      const playlist = await client.post(`/api/v1/orgs/${org}/playlists`, { name: 'P' });
      const { id } = playlist.json<{ playlist: { id: string } }>().playlist;
      const widgetId = res.json<{ widget: { id: string } }>().widget.id;
      await client.put(`/api/v1/orgs/${org}/playlists/${id}/items`, {
        items: [{ widgetId, durationMs: null }],
      });
    }
    return { orgA, orgB, a };
  }

  it('shows only the organization’s rows to a query without a filter', async () => {
    const { orgA, a } = await twoOrgs();
    const res = await a.get(`/api/v1/orgs/${orgA}/__probe`);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{
      role: string;
      org: string;
      widgets: { name: string; org_id: string }[];
      users: string[];
      items: unknown[];
      sessions: string;
    }>();
    expect(body.role).toBe('rubinny_tenant');
    expect(body.org).toBe(orgA);
    expect(body.widgets).toEqual([{ name: 'Clock A', org_id: orgA }]);
    expect(body.users).toEqual(['a@example.com']);
    expect(body.items).toHaveLength(1); // child rows follow their parent playlist
    expect(body.sessions).toBe('42501'); // insufficient_privilege: no access at all
  });

  it('refuses writes into another organization and limits careless deletes', async () => {
    const { orgA, orgB, a } = await twoOrgs();
    const planted = await a.post(`/api/v1/orgs/${orgA}/__probe`, { orgId: orgB });
    expect(planted.statusCode).toBe(500); // new row violates row-level security policy
    const deleted = await a.delete(`/api/v1/orgs/${orgA}/__probe`);
    expect(deleted.json()).toEqual({ deleted: 1 });
    const left = await h.db.selectFrom('widgets').select(['name', 'org_id']).execute();
    expect(left).toEqual([{ name: 'Clock B', org_id: orgB }]);
  });

  it('rolls back the whole request on an error, and the connection is clean afterwards', async () => {
    const { orgA, orgB, a } = await twoOrgs();
    await a.post(`/api/v1/orgs/${orgA}/__probe`, { orgId: orgB });
    // Nothing of the failed request remains, and later system queries are not restricted.
    const all = await h.db.selectFrom('widgets').select('name').orderBy('name').execute();
    expect(all.map((row) => row.name)).toEqual(['Clock A', 'Clock B']);
    for (let i = 0; i < 25; i++) {
      const who = await sql<{ role: string; org: string | null }>`
        SELECT current_user AS role, nullif(current_setting('app.org_id', true), '') AS org`.execute(
        h.db,
      );
      expect(who.rows[0]?.role).not.toBe('rubinny_tenant');
      expect(who.rows[0]?.org).toBeNull();
    }
  });

  it('notifies screens only after the commit, and never for a failed request', async () => {
    h = await createHarness(
      {},
      {
        extraRoutes: (app, ctx) => {
          probeRoutes(app, ctx);
          app.put(
            '/api/v1/orgs/:orgId/__probe',
            { preHandler: orgGuard(ctx, 'EDITOR') },
            async () => {
              await ctx.events.publish('00000000-0000-4000-8000-000000000009', {
                type: 'reload',
              });
              throw new Error('fails after publishing');
            },
          );
        },
      },
    );
    const orgA = await insertOrg(h.db, await insertUser(h.db, 'a@example.com'), 'A', false);
    const a = await login(h.app, 'a@example.com');
    const player = await a.request('POST', '/player/v1/pair/start');
    const { code } = player.json<{ code: string }>();
    const screen = await a.post(`/api/v1/orgs/${orgA}/screens`, { code, name: 'Hall' });
    expect(screen.statusCode, screen.body).toBe(201);

    // When the screen hears about the alert, the alert is already visible to everyone.
    const seen: (number | string)[] = [];
    h.events.onEvent((screenId) => {
      void h.db
        .selectFrom('alerts')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .executeTakeFirstOrThrow()
        .then((row) =>
          seen.push(screenId === '00000000-0000-4000-8000-000000000009' ? 'x' : Number(row.count)),
        );
    });
    const started = await a.post(`/api/v1/orgs/${orgA}/alerts`, {
      style: 'emergency',
      title: 'Now',
    });
    expect(started.statusCode, started.body).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(seen).toEqual([1]);

    // A request that fails after "publishing" sends nothing.
    expect((await a.request('PUT', `/api/v1/orgs/${orgA}/__probe`)).statusCode).toBe(500);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(seen).toEqual([1]);
  });

  it('can be switched off (DATABASE_RLS=false)', async () => {
    h = await createHarness({ DATABASE_RLS: 'false' }, { extraRoutes: probeRoutes });
    const orgA = await insertOrg(h.db, await insertUser(h.db, 'a@example.com'), 'A', false);
    const a = await login(h.app, 'a@example.com');
    const res = await a.get(`/api/v1/orgs/${orgA}/__probe`);
    expect(res.json<{ role: string }>().role).not.toBe('rubinny_tenant');
  });

  it('admits only members (the guard runs before any transaction)', async () => {
    h = await createHarness({}, { extraRoutes: probeRoutes });
    const orgA = await insertOrg(h.db, await insertUser(h.db, 'a@example.com'), 'A', false);
    await insertUser(h.db, 'stranger@example.com');
    const stranger = await login(h.app, 'stranger@example.com');
    expect((await stranger.get(`/api/v1/orgs/${orgA}/__probe`)).statusCode).toBe(404);
  });
});
