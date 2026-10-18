import Fastify, { type RouteOptions } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertOrgRouteGuarded, orgGuard } from '../../src/modules/auth/guards.js';
import type { AppContext } from '../../src/context.js';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

describe('organization routes must be guarded', () => {
  const ctx = {} as AppContext;
  const route = (url: string, preHandler?: unknown) =>
    ({ method: 'GET', url, handler: () => null, preHandler }) as RouteOptions;

  it('refuses an organization route without orgGuard, at startup', async () => {
    expect(() => {
      assertOrgRouteGuarded(route('/api/v1/orgs/:orgId/secrets'));
    }).toThrow('without orgGuard: GET /api/v1/orgs/:orgId/secrets');
    // Another preHandler is not enough.
    expect(() => {
      assertOrgRouteGuarded(route('/api/v1/orgs/:orgId/secrets', [() => undefined]));
    }).toThrow();
    expect(() => {
      assertOrgRouteGuarded(route('/api/v1/orgs/:orgId/x', [orgGuard(ctx, 'VIEWER')]));
    }).not.toThrow();
    expect(() => {
      assertOrgRouteGuarded(route('/api/v1/me'));
    }).not.toThrow();

    // In a real app the route is refused as soon as it is registered.
    const app = Fastify();
    app.addHook('onRoute', assertOrgRouteGuarded);
    expect(() => app.get('/api/v1/orgs/:orgId/forgotten', () => 'leak')).toThrow(
      'without orgGuard',
    );
    await app.close();
  });
});

/**
 * IDOR/BOLA: every organization route that takes a resource id is called by a member of
 * another organization with the ids of this one, through both organization ids. Every call
 * must answer 404 (as if the resource did not exist) and change nothing.
 */
describe.runIf(integrationEnabled)('tenant isolation on every route with an id', () => {
  let h: Harness;
  let orgA: string;
  let orgB: string;
  let ownerA: Client;
  let ownerB: Client;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    h = await createHarness();
    orgA = await insertOrg(h.db, await insertUser(h.db, 'a@example.com'), 'A', false);
    orgB = await insertOrg(h.db, await insertUser(h.db, 'b@example.com'), 'B', false);
    ownerA = await login(h.app, 'a@example.com');
    ownerB = await login(h.app, 'b@example.com');
    const inA = (path: string) => `/api/v1/orgs/${orgA}${path}`;
    const created = async (path: string, body: unknown, key: string) => {
      const res = await ownerA.post(inA(path), body);
      expect(res.statusCode, `${path}: ${res.body}`).toBe(201);
      return res.json<Record<string, { id: string }>>()[key]!.id;
    };

    ids.playlistId = await created('/playlists', { name: 'A playlist' }, 'playlist');
    ids.widgetId = await created(
      '/widgets',
      { type: 'clock', name: 'A clock', config: {} },
      'widget',
    );
    ids.layoutId = await created(
      '/layouts',
      {
        name: 'A layout',
        width: 1920,
        height: 1080,
        zones: [{ name: 'main', x: 0, y: 0, w: 1920, h: 1080, z: 0 }],
      },
      'layout',
    );
    ids.scheduleId = await created('/schedules', { name: 'A schedule', entries: [] }, 'schedule');
    const player = new Client(h.app, '203.0.113.20');
    const start = (await player.post('/player/v1/pair/start')).json<{ code: string }>();
    ids.screenId = await created('/screens', { code: start.code, name: 'A screen' }, 'screen');
    ids.groupId = await created(
      '/screen-groups',
      { name: 'A group', screenIds: [ids.screenId] },
      'group',
    );
    ids.alertId = await created(
      '/alerts',
      { style: 'notice', title: 'A notice', durationMinutes: 60 },
      'alert',
    );
    ids.approvalId = (
      await h.db
        .insertInto('approval_requests')
        .values({
          org_id: orgA,
          method: 'PATCH',
          path: `/api/v1/orgs/${orgA}/playlists/${ids.playlistId}`,
          body: JSON.stringify({ name: 'held' }),
          summary: JSON.stringify({ kind: 'playlist', name: 'A playlist', action: 'update' }),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    ids.invitationId = await created(
      '/invitations',
      { email: 'new@example.com', role: 'VIEWER' },
      'invitation',
    );
    const member = await insertUser(h.db, 'member-a@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgA, user_id: member, role: 'EDITOR' })
      .execute();
    ids.userId = member;
    // Media needs object storage; its isolation is covered in test/media/flow.test.ts.
    ids.mediaId = '00000000-0000-4000-8000-000000000001';
  });

  afterEach(async () => {
    await h.close();
  });

  /** Plausible bodies, so a call is rejected by isolation and not by validation. */
  const BODIES: Record<string, unknown> = {
    'PATCH /playlists/:playlistId': { name: 'hacked' },
    'PUT /playlists/:playlistId/items': { items: [] },
    'POST /playlists/:playlistId/duplicate': { name: 'copy' },
    'POST /schedules/:scheduleId/duplicate': { name: 'copy' },
    'PATCH /widgets/:widgetId': { name: 'hacked' },
    'POST /widgets/:widgetId/duplicate': { name: 'copy' },
    'PATCH /layouts/:layoutId': { name: 'hacked' },
    'POST /layouts/:layoutId/duplicate': { name: 'copy' },
    'PATCH /schedules/:scheduleId': { name: 'hacked' },
    'PATCH /screens/:screenId': { name: 'hacked' },
    'PATCH /screen-groups/:groupId': { name: 'hacked' },
    'PUT /screen-groups/:groupId/content': { playlistId: null },
    'PATCH /members/:userId': { role: 'VIEWER' },
    'PATCH /media/:mediaId': { name: 'hacked' },
  };

  /** Routes whose ids are not this organization's resources. */
  const SHARED = new Set([':kitId', ':imageId']);

  it('answers 404 and changes nothing', async () => {
    await h.app.ready();
    // Every route with an id, from the routes the server actually registered.
    const templates = new Set<string>();
    for (const route of h.routes) {
      // HEAD routes share the GET handlers.
      if (route.method === 'HEAD' || !route.url.startsWith('/api/v1/orgs/:orgId/')) continue;
      const params = route.url.match(/:[A-Za-z]+/g) ?? [];
      const resourceParams = params.filter((p) => p !== ':orgId');
      if (resourceParams.length === 0 || resourceParams.some((p) => SHARED.has(p))) continue;
      templates.add(`${route.method} ${route.url.slice('/api/v1/orgs/:orgId'.length)}`);
    }
    // 30 without object storage (the media routes are then not registered).
    expect(templates.size).toBeGreaterThanOrEqual(30);

    const wrong: string[] = [];
    let attempts = 0;
    for (const template of templates) {
      const [method, path] = template.split(' ') as [Parameters<Client['request']>[0], string];
      const concrete = path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
        const id = ids[name];
        if (!id) throw new Error(`No test resource for :${name} in ${template}`);
        return id;
      });
      for (const org of [orgB, orgA]) {
        const res = await ownerB.request(
          method,
          `/api/v1/orgs/${org}${concrete}`,
          BODIES[template] ?? {},
        );
        attempts++;
        if (res.statusCode !== 404) {
          wrong.push(
            `${template} via org ${org === orgA ? 'A' : 'B'}: ${res.statusCode} ${res.body}`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(attempts).toBe(templates.size * 2);

    // Nothing of A changed or disappeared.
    const inA = (path: string) => `/api/v1/orgs/${orgA}${path}`;
    expect((await ownerA.get(inA(`/playlists/${ids.playlistId}`))).json()).toMatchObject({
      playlist: { name: 'A playlist' },
    });
    expect((await ownerA.get(inA(`/widgets/${ids.widgetId}`))).json()).toMatchObject({
      widget: { name: 'A clock' },
    });
    expect((await ownerA.get(inA(`/layouts/${ids.layoutId}`))).json()).toMatchObject({
      layout: { name: 'A layout' },
    });
    expect((await ownerA.get(inA(`/schedules/${ids.scheduleId}`))).json()).toMatchObject({
      schedule: { name: 'A schedule' },
    });
    const screens = (await ownerA.get(inA('/screens'))).json<{ screens: { name: string }[] }>();
    expect(screens.screens.map((s) => s.name)).toEqual(['A screen']);
    expect((await ownerA.get(inA('/screen-groups'))).json()).toEqual({
      groups: [{ id: ids.groupId, name: 'A group', screenIds: [ids.screenId] }],
    });
    const members = await h.db
      .selectFrom('memberships')
      .select('role')
      .where('user_id', '=', ids.userId!)
      .executeTakeFirstOrThrow();
    expect(members.role).toBe('EDITOR');
    const invitation = await h.db
      .selectFrom('invitations')
      .select('id')
      .where('id', '=', ids.invitationId!)
      .executeTakeFirst();
    expect(invitation).toBeDefined();
    const alert = await h.db
      .selectFrom('alerts')
      .select('ended_at')
      .where('id', '=', ids.alertId!)
      .executeTakeFirstOrThrow();
    expect(alert.ended_at).toBeNull();
    const approval = await h.db
      .selectFrom('approval_requests')
      .select('status')
      .where('id', '=', ids.approvalId!)
      .executeTakeFirstOrThrow();
    expect(approval.status).toBe('pending');
  });
});
