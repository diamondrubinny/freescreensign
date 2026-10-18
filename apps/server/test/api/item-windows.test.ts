import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localTime, parseManifest, type ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Item {
  widgetId: string;
  window: Record<string, unknown> | null;
}

describe.runIf(integrationEnabled)('playlist items shown only in a time window', () => {
  let h: Harness;
  let orgId: string;
  let editor: Client;

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    editor = await login(h.app, 'admin@school.example');
  });
  afterEach(() => h.close());

  async function widget(name: string) {
    const res = await editor.post(api('/widgets'), { type: 'text', name, config: { text: name } });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ widget: { id: string } }>().widget.id;
  }

  async function playlistWith(items: unknown[]) {
    const playlist = (await editor.post(api('/playlists'), { name: 'Lobby' })).json<{
      playlist: { id: string };
    }>().playlist;
    const res = await editor.put(api(`/playlists/${playlist.id}/items`), { items });
    return { id: playlist.id, res };
  }

  async function manifestFor(playlistId: string, timezone = 'Asia/Jerusalem') {
    const player = new Client(h.app, '203.0.113.60');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const screen = await editor.post(api('/screens'), {
      code: start.code,
      name: 'Hall',
      playlistId,
    });
    expect(screen.statusCode, screen.body).toBe(201);
    const id = screen.json<{ screen: { id: string } }>().screen.id;
    expect((await editor.patch(api(`/screens/${id}`), { timezone })).statusCode).toBe(200);
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();
    const res = await h.app.inject({
      url: '/player/v1/manifest',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(parseManifest(res.json()).success).toBe(true);
    return res.json<ManifestV1>();
  }

  it('stores a window per item, normalizes "always" and sends it to the screen', async () => {
    const lunch = await widget('Lunch');
    const always = await widget('Welcome');
    const { id, res } = await playlistWith([
      {
        widgetId: lunch,
        durationMs: 10_000,
        window: { daysOfWeek: [4, 0, 4], timeFrom: '11:30', timeTo: '13:30' },
      },
      { widgetId: always, durationMs: 10_000, window: { daysOfWeek: [] } },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    const items = res.json<{ playlist: { items: Item[] } }>().playlist.items;
    expect(items[0]?.window).toEqual({
      dateFrom: null,
      dateTo: null,
      daysOfWeek: [0, 4],
      timeFrom: '11:30',
      timeTo: '13:30',
    });
    expect(items[1]?.window).toBeNull();

    const manifest = await manifestFor(id);
    const playlist = manifest.playlists.find((p) => p.id === id)!;
    expect(playlist.items[0]).toMatchObject({
      ref: lunch,
      window: { daysOfWeek: [0, 4], timeFrom: '11:30', timeTo: '13:30' },
    });
    expect(playlist.items[1]?.window).toBeUndefined();

    // A copy keeps the windows.
    const copy = await editor.post(api(`/playlists/${id}/duplicate`), { name: 'Copy' });
    expect(copy.json<{ playlist: { items: Item[] } }>().playlist.items[0]?.window).toMatchObject({
      timeFrom: '11:30',
    });
  });

  it('refuses invalid windows with the item’s field path', async () => {
    const w = await widget('Notice');
    const cases: [unknown, string][] = [
      [{ dateFrom: '2026-10-20', dateTo: '2026-10-19' }, 'items.0.window.dateTo'],
      [{ timeFrom: '08:00' }, 'items.0.window.timeTo'],
      [{ dateFrom: '2026-02-30' }, 'items.0.window.dateFrom'],
      [{ daysOfWeek: [9] }, 'items.0.window.daysOfWeek.0'],
    ];
    for (const [window, path] of cases) {
      const { res } = await playlistWith([{ widgetId: w, durationMs: 10_000, window }]);
      expect(res.statusCode, JSON.stringify(window)).toBe(400);
      expect(res.json<{ error: { fields: { path: string }[] } }>().error.fields).toContainEqual(
        expect.objectContaining({ path }),
      );
    }
  });

  it('leaves out items whose window is over, by the screen’s own date', async () => {
    const old = await widget('Last week');
    const current = await widget('Today');
    // Yesterday in the screen's zone: over. Today: still on.
    const today = localTime(new Date(), 'Pacific/Kiritimati').date;
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const { id } = await playlistWith([
      { widgetId: old, durationMs: 10_000, window: { dateTo: yesterday } },
      { widgetId: current, durationMs: 10_000, window: { dateTo: today } },
    ]);
    const manifest = await manifestFor(id, 'Pacific/Kiritimati');
    const playlist = manifest.playlists.find((p) => p.id === id)!;
    expect(playlist.items.map((item) => item.ref)).toEqual([current]);
    expect(manifest.widgets.map((w) => w.id)).toEqual([current]);
  });
});
