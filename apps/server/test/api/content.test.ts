import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseManifest, templateZones, type ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Local news</title>
<item><title>First &lt;b&gt;headline&lt;/b&gt;</title></item><item><title>Second</title></item>
<item><title>Third</title></item></channel></rss>`;

describe.runIf(integrationEnabled)('layouts, widgets and the content manifest', () => {
  let feedServer: http.Server;
  let feedBase: string;
  let feedHits = 0;
  let feedDown = false;

  beforeAll(async () => {
    feedServer = http.createServer((request, response) => {
      feedHits++;
      if (feedDown) {
        response.writeHead(503).end();
        return;
      }
      if (request.url === '/feed.xml') {
        response.writeHead(200, { 'content-type': 'application/rss+xml' }).end(FEED);
        return;
      }
      if (request.url?.startsWith('/forecast')) {
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            current: { temperature_2m: 21.4, weather_code: 2 },
            daily: {
              time: ['2026-10-15'],
              weather_code: [2],
              temperature_2m_max: [24],
              temperature_2m_min: [17],
            },
          }),
        );
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => feedServer.listen(0, '127.0.0.1', resolve));
    feedBase = `http://127.0.0.1:${String((feedServer.address() as AddressInfo).port)}`;
  });
  afterAll(
    () =>
      new Promise<void>((resolve) =>
        feedServer.close(() => {
          resolve();
        }),
      ),
  );

  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;
  let viewer: Client;
  let outsider: Client;

  beforeEach(async () => {
    feedDown = false;
    h = await createHarness({
      WIDGET_FETCH_ALLOW_PRIVATE: 'true',
      WEATHER_API_URL: `${feedBase}/forecast`,
    });
    const ownerId = await insertUser(h.db, 'owner@example.com');
    orgId = await insertOrg(h.db, ownerId, 'Org', false);
    for (const [email, role] of [
      ['editor@example.com', 'EDITOR'],
      ['viewer@example.com', 'VIEWER'],
    ] as const) {
      const id = await insertUser(h.db, email);
      await h.db.insertInto('memberships').values({ org_id: orgId, user_id: id, role }).execute();
    }
    otherOrgId = await insertOrg(
      h.db,
      await insertUser(h.db, 'outsider@example.com'),
      'Other',
      false,
    );
    editor = await login(h.app, 'editor@example.com');
    viewer = await login(h.app, 'viewer@example.com');
    outsider = await login(h.app, 'outsider@example.com');
  });
  afterEach(() => h.close());

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;

  async function createWidget(type: string, config: Record<string, unknown>, name = type) {
    const res = await editor.post(api('/widgets'), { type, name, config });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ widget: { id: string; config: Record<string, unknown> } }>().widget;
  }

  async function createPlaylist(name: string, items: Record<string, unknown>[]) {
    const created = (await editor.post(api('/playlists'), { name })).json<{
      playlist: { id: string };
    }>();
    const res = await editor.put(api(`/playlists/${created.playlist.id}/items`), { items });
    expect(res.statusCode, res.body).toBe(200);
    return created.playlist.id;
  }

  async function pair(): Promise<{ deviceToken: string; screenId: string }> {
    const player = new Client(h.app, '203.0.113.10');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    expect(
      (await editor.post(api('/screens'), { code: start.code, name: 'Lobby' })).statusCode,
    ).toBe(201);
    return (await player.post('/player/v1/pair/status', { pollToken: start.pollToken })).json();
  }

  const playerGet = (url: string, token: string) =>
    h.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  it('creates widgets with validated configuration and defaults', async () => {
    const types = (await viewer.get(api('/widget-types'))).json<{
      types: { type: string; available: boolean }[];
      weather: { enabled: boolean };
    }>();
    expect(types.weather.enabled).toBe(true);
    expect(types.types.map((t) => t.type)).toEqual([
      'clock',
      'text',
      'ticker',
      'qr',
      'rss',
      'weather',
      'webpage',
    ]);

    const clock = await createWidget('clock', {});
    expect(clock.config).toMatchObject({ format: '24h', showHebrewDate: true });

    const bad = await editor.post(api('/widgets'), {
      type: 'qr',
      name: 'QR',
      config: { url: 'javascript:alert(1)' },
    });
    expect(bad.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: [{ path: 'config.url' }] },
    });
    const unknown = await editor.post(api('/widgets'), { type: 'evil', name: 'x', config: {} });
    expect(unknown.json()).toMatchObject({
      error: { fields: [{ path: 'type', reason: 'unavailable' }] },
    });

    // Viewers can read but not write; other organizations see nothing.
    expect(
      (await viewer.post(api('/widgets'), { type: 'clock', name: 'x', config: {} })).statusCode,
    ).toBe(403);
    expect((await viewer.get(api(`/widgets/${clock.id}`))).statusCode).toBe(200);
    expect((await outsider.get(api(`/widgets/${clock.id}`))).statusCode).toBe(404);
    expect((await outsider.get(api(`/widgets/${clock.id}`, otherOrgId))).statusCode).toBe(404);
    expect(
      (await outsider.patch(api(`/widgets/${clock.id}`, otherOrgId), { name: 'x' })).statusCode,
    ).toBe(404);
  });

  it('disables weather unless the operator configured an endpoint', async () => {
    const plain = await createHarness();
    try {
      const ownerId = await insertUser(plain.db, 'o@example.com');
      const org = await insertOrg(plain.db, ownerId, 'O', false);
      const owner = await login(plain.app, 'o@example.com');
      const types = (await owner.get(`/api/v1/orgs/${org}/widget-types`)).json<{
        types: { type: string; available: boolean }[];
      }>();
      expect(types.types.find((t) => t.type === 'weather')?.available).toBe(false);
      const res = await owner.post(`/api/v1/orgs/${org}/widgets`, {
        type: 'weather',
        name: 'W',
        config: { latitude: 32, longitude: 34, locationName: 'TLV' },
      });
      expect(res.json()).toMatchObject({
        error: { fields: [{ path: 'type', reason: 'unavailable' }] },
      });
    } finally {
      await plain.close();
    }
  });

  it('manages layouts with zones, bounds and same-org playlists', async () => {
    const playlistId = await createPlaylist('Main', []);
    const zones = templateZones('main-ticker', { width: 1920, height: 1080 });
    const created = await editor.post(api('/layouts'), {
      name: 'Lobby',
      width: 1920,
      height: 1080,
      zones: zones.map((zone, i) => (i === 0 ? { ...zone, playlistId } : zone)),
    });
    expect(created.statusCode, created.body).toBe(201);
    const { layout } = created.json<{
      layout: { id: string; zones: { name: string; h: number; playlistName: string | null }[] };
    }>();
    expect(layout.zones.map((z) => [z.name, z.h, z.playlistName])).toEqual([
      ['main', 950, 'Main'],
      ['ticker', 130, null],
    ]);

    const outside = await editor.post(api('/layouts'), {
      name: 'Bad',
      width: 1000,
      height: 500,
      zones: [{ name: 'a', x: 900, y: 0, w: 200, h: 100 }],
    });
    expect(outside.json()).toMatchObject({
      error: { fields: [{ path: 'zones.0.w', reason: 'out_of_bounds' }] },
    });
    // Shrinking the canvas below existing zones is refused too.
    const shrink = await editor.patch(api(`/layouts/${layout.id}`), { width: 1000 });
    expect(shrink.json()).toMatchObject({
      error: {
        fields: [
          { path: 'zones.0.w', reason: 'out_of_bounds' },
          { path: 'zones.1.w', reason: 'out_of_bounds' },
        ],
      },
    });

    // A playlist of another organization cannot be referenced.
    const foreign = await h.db
      .insertInto('playlists')
      .values({ org_id: otherOrgId, name: 'Theirs' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const idor = await editor.patch(api(`/layouts/${layout.id}`), {
      zones: [{ name: 'main', x: 0, y: 0, w: 100, h: 100, playlistId: foreign.id }],
    });
    expect(idor.json()).toMatchObject({ error: { fields: [{ path: 'zones.0.playlistId' }] } });

    const list = (await viewer.get(api('/layouts'))).json<{ layouts: { zoneCount: number }[] }>();
    expect(list.layouts).toMatchObject([{ zoneCount: 2 }]);
    expect((await viewer.delete(api(`/layouts/${layout.id}`))).statusCode).toBe(403);
    expect((await outsider.get(api(`/layouts/${layout.id}`, otherOrgId))).statusCode).toBe(404);
    expect((await editor.delete(api(`/layouts/${layout.id}`))).statusCode).toBe(204);
  });

  it('serves a manifest with layout zones, widgets and media-free playlists', async () => {
    const clock = await createWidget('clock', { showSeconds: true });
    const ticker = await createWidget('ticker', { text: 'ברוכים הבאים' });
    const rss = await createWidget('rss', { url: `${feedBase}/feed.xml`, maxItems: 2 });
    const mainId = await createPlaylist('Main', [
      { widgetId: clock.id, durationMs: null },
      { widgetId: rss.id, durationMs: null },
    ]);
    const tickerId = await createPlaylist('Ticker', [{ widgetId: ticker.id, durationMs: 60_000 }]);
    const zones = templateZones('main-ticker', { width: 1920, height: 1080 });
    const { layout } = (
      await editor.post(api('/layouts'), {
        name: 'Lobby',
        width: 1920,
        height: 1080,
        background: '#102030',
        zones: [
          { ...zones[0], playlistId: mainId },
          { ...zones[1], playlistId: tickerId, z: 1 },
        ],
      })
    ).json<{ layout: { id: string } }>();

    const { deviceToken, screenId } = await pair();
    const assigned = await editor.patch(api(`/screens/${screenId}`), { layoutId: layout.id });
    expect(assigned.json()).toMatchObject({ screen: { layoutId: layout.id, layoutName: 'Lobby' } });

    const res = await playerGet('/player/v1/manifest', deviceToken);
    expect(res.statusCode).toBe(200);
    const parsed = parseManifest(res.json());
    expect(parsed.success).toBe(true);
    const manifest = res.json<ManifestV1>();
    expect(manifest.layouts).toEqual([
      expect.objectContaining({ id: layout.id, background: '#102030' }),
    ]);
    expect(manifest.schedule.defaultLayoutId).toBe(layout.id);
    expect(manifest.layouts[0]!.zones.map((z) => [z.playlistId, z.z])).toEqual([
      [mainId, 0],
      [tickerId, 1],
    ]);
    expect(manifest.widgets.map((w) => w.type).sort()).toEqual(['clock', 'rss', 'ticker']);
    const main = manifest.playlists.find((p) => p.id === mainId)!;
    // RSS defaults to one rotation: 2 items x 8s.
    expect(main.items.map((i) => [i.kind, i.durationMs])).toEqual([
      ['widget', 15_000],
      ['widget', 16_000],
    ]);

    // Changing a widget pushes a new manifest version.
    const before = manifest.version;
    await editor.patch(api(`/widgets/${ticker.id}`), { config: { text: 'Shalom' } });
    const after = (await playerGet('/player/v1/manifest', deviceToken)).json<ManifestV1>();
    expect(after.version).not.toBe(before);

    // Deleting a widget removes it from playlists and the manifest.
    expect((await editor.delete(api(`/widgets/${clock.id}`))).statusCode).toBe(204);
    const pruned = (await playerGet('/player/v1/manifest', deviceToken)).json<ManifestV1>();
    expect(pruned.widgets.map((w) => w.type).sort()).toEqual(['rss', 'ticker']);

    // Deleting the layout falls back to the screen's playlist (none here).
    await editor.delete(api(`/layouts/${layout.id}`));
    const fallback = (await playerGet('/player/v1/manifest', deviceToken)).json<ManifestV1>();
    expect(fallback.layouts[0]!.id).toBe('default');
  });

  it('fetches feed data through the server with caching and stale fallback', async () => {
    const rss = await createWidget('rss', { url: `${feedBase}/feed.xml`, maxItems: 2 });
    const { deviceToken } = await pair();

    feedHits = 0;
    const first = await playerGet(`/player/v1/widgets/${rss.id}/data`, deviceToken);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      type: 'rss',
      stale: false,
      data: { title: 'Local news', items: [{ title: 'First headline' }, { title: 'Second' }] },
    });
    // Served from the cache: no new upstream request.
    await viewer.get(api(`/widgets/${rss.id}/data`));
    expect(feedHits).toBe(1);

    // Upstream down + cache expired → the stale copy is served.
    const keys = await h.redis.keys('*widget-data:rss:*');
    for (const key of keys) {
      const entry = JSON.parse((await h.redis.get(key))!) as { fetchedAt: string };
      entry.fetchedAt = new Date(Date.now() - 3_600_000).toISOString();
      await h.redis.set(key, JSON.stringify(entry), 'EX', 600);
    }
    feedDown = true;
    const stale = await playerGet(`/player/v1/widgets/${rss.id}/data`, deviceToken);
    expect(stale.json()).toMatchObject({ stale: true, data: { title: 'Local news' } });

    // Without any cached copy the error is explicit.
    const other = await createWidget('rss', { url: `${feedBase}/feed.xml`, maxItems: 3 });
    const failed = await viewer.get(api(`/widgets/${other.id}/data`));
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ error: { code: 'UPSTREAM_FAILED' } });

    // Weather goes through the operator-configured endpoint.
    feedDown = false;
    const weather = await createWidget('weather', {
      latitude: 32.08,
      longitude: 34.78,
      locationName: 'תל אביב',
      days: 1,
    });
    const forecast = await viewer.get(api(`/widgets/${weather.id}/data`));
    expect(forecast.json()).toMatchObject({
      type: 'weather',
      data: { current: { temperature: 21, weatherCode: 2 }, daily: [{ min: 17, max: 24 }] },
    });

    // Widgets without server data, and widgets of other organizations, are 404.
    const clock = await createWidget('clock', {});
    expect((await playerGet(`/player/v1/widgets/${clock.id}/data`, deviceToken)).statusCode).toBe(
      404,
    );
    const foreign = await h.db
      .insertInto('widgets')
      .values({
        org_id: otherOrgId,
        type: 'rss',
        name: 'Theirs',
        config: JSON.stringify({ url: `${feedBase}/feed.xml` }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    expect((await playerGet(`/player/v1/widgets/${foreign.id}/data`, deviceToken)).statusCode).toBe(
      404,
    );
    expect((await playerGet(`/player/v1/widgets/${rss.id}/data`, 'bad-token')).statusCode).toBe(
      401,
    );
  });

  it('accepts mixed media/widget playlist items only from the same organization', async () => {
    const text = await createWidget('text', { text: 'Hello' });
    const foreign = await h.db
      .insertInto('widgets')
      .values({
        org_id: otherOrgId,
        type: 'text',
        name: 'x',
        config: JSON.stringify({ text: 'x' }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const created = (await editor.post(api('/playlists'), { name: 'P' })).json<{
      playlist: { id: string };
    }>();
    const res = await editor.put(api(`/playlists/${created.playlist.id}/items`), {
      items: [
        { widgetId: text.id, durationMs: 5000 },
        { widgetId: foreign.id, durationMs: null },
      ],
    });
    expect(res.json()).toMatchObject({ error: { fields: [{ path: 'items.1.widgetId' }] } });
    const ok = await editor.put(api(`/playlists/${created.playlist.id}/items`), {
      items: [{ widgetId: text.id, durationMs: 5000 }],
    });
    expect(ok.json()).toMatchObject({
      playlist: {
        items: [{ kind: 'widget', widgetType: 'text', name: 'text', effectiveDurationMs: 5000 }],
      },
    });
  });
});
