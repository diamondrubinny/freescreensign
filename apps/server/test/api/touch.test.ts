// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseManifest, type ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Layout {
  id: string;
  idleSeconds: number;
  zones: { name: string; action: unknown; label: string | null }[];
}

describe.runIf(integrationEnabled)('touch screens: zones that open other layouts', () => {
  let h: Harness;
  let orgId: string;
  let editor: Client;
  let events: string[];

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    editor = await login(h.app, 'admin@school.example');
    events = [];
    h.events.onEvent((screenId, event) => {
      events.push(`${screenId}:${event.type}`);
    });
  });
  afterEach(() => h.close());

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  const zone = (name: string, extra: Record<string, unknown> = {}) => ({
    name,
    x: 0,
    y: 0,
    w: 960,
    h: 540,
    ...extra,
  });

  async function createLayout(name: string, zones: unknown[], extra: object = {}) {
    const res = await editor.post(api('/layouts'), {
      name,
      width: 1920,
      height: 1080,
      zones,
      ...extra,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ layout: Layout }>().layout;
  }

  async function screenShowing(layoutId: string) {
    const player = new Client(h.app, '203.0.113.50');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const screen = await editor.post(api('/screens'), { code: start.code, name: 'Lobby' });
    expect(screen.statusCode, screen.body).toBe(201);
    const id = screen.json<{ screen: { id: string } }>().screen.id;
    await editor.patch(api(`/screens/${id}`), { layoutId });
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();
    const manifest = async () => {
      const res = await h.app.inject({
        url: '/player/v1/manifest',
        headers: { authorization: `Bearer ${deviceToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(parseManifest(res.json()).success).toBe(true);
      return res.json<ManifestV1>();
    };
    return { id, manifest };
  }

  it('serves the layouts a tap opens, with actions, names and idle time', async () => {
    const map = await createLayout('Floor 2', [zone('Back', { action: { type: 'back' } })], {
      idleSeconds: 30,
    });
    const home = await createLayout('Directory', [
      zone('Floor 2', { action: { type: 'layout', layoutId: map.id }, label: 'Open floor 2' }),
      zone('Clock', { x: 960 }),
    ]);
    expect(home.idleSeconds).toBe(60);
    expect(home.zones[0]).toMatchObject({
      action: { type: 'layout', layoutId: map.id },
      label: 'Open floor 2',
    });

    const screen = await screenShowing(home.id);
    const manifest = await screen.manifest();
    expect(manifest.schedule.defaultLayoutId).toBe(home.id);
    expect(manifest.layouts.map((l) => l.id).sort()).toEqual([home.id, map.id].sort());
    const homeZones = manifest.layouts.find((l) => l.id === home.id)!.zones;
    expect(homeZones[0]).toMatchObject({
      action: { type: 'layout', layoutId: map.id },
      label: 'Open floor 2',
    });
    expect(homeZones[1]?.action).toBeUndefined();
    const mapLayout = manifest.layouts.find((l) => l.id === map.id)!;
    expect(mapLayout).toMatchObject({ idleSeconds: 30 });
    // No label given: the zone's name is its accessible name.
    expect(mapLayout.zones[0]).toMatchObject({ action: { type: 'back' }, label: 'Back' });

    // Changing the linked layout refreshes the screen that can open it.
    events.length = 0;
    await editor.patch(api(`/layouts/${map.id}`), { idleSeconds: 45 });
    await settle();
    expect(events).toContain(`${screen.id}:manifest.changed`);

    // Deleting it leaves the tap without an action (and refreshes the screen).
    events.length = 0;
    expect((await editor.delete(api(`/layouts/${map.id}`))).statusCode).toBe(204);
    await settle();
    expect(events).toContain(`${screen.id}:manifest.changed`);
    const after = await screen.manifest();
    expect(after.layouts.map((l) => l.id)).toEqual([home.id]);
    expect(after.layouts[0]!.zones[0]?.action).toBeUndefined();
    const detail = (await editor.get(api(`/layouts/${home.id}`))).json<{ layout: Layout }>();
    expect(detail.layout.zones[0]?.action).toBeNull();
  });

  it('refreshes screens when a playlist in a linked layout changes', async () => {
    const playlist = (await editor.post(api('/playlists'), { name: 'Map' })).json<{
      playlist: { id: string };
    }>().playlist;
    const map = await createLayout('Map', [zone('Map', { playlistId: playlist.id })]);
    const home = await createLayout('Home', [
      zone('Go', { action: { type: 'layout', layoutId: map.id } }),
    ]);
    const screen = await screenShowing(home.id);
    events.length = 0;
    await editor.patch(api(`/playlists/${playlist.id}`), { name: 'Map 2' });
    await editor.put(api(`/playlists/${playlist.id}/items`), { items: [] });
    await settle();
    expect(events).toContain(`${screen.id}:manifest.changed`);
  });

  it('refuses targets of another organization, unknown targets and the layout itself', async () => {
    const otherOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'other@example.com'),
      'Other',
      false,
    );
    const other = await login(h.app, 'other@example.com');
    const foreign = (
      await other.post(api('/layouts', otherOrg), {
        name: 'Foreign',
        width: 1920,
        height: 1080,
        zones: [zone('A')],
      })
    ).json<{ layout: { id: string } }>().layout;

    const res = await editor.post(api('/layouts'), {
      name: 'Bad',
      width: 1920,
      height: 1080,
      zones: [zone('A', { action: { type: 'layout', layoutId: foreign.id } })],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { fields: [{ path: 'zones.0.action.layoutId', reason: 'invalid' }] },
    });

    const own = await createLayout('Own', [zone('A')]);
    const self = await editor.patch(api(`/layouts/${own.id}`), {
      zones: [zone('A', { action: { type: 'layout', layoutId: own.id } })],
    });
    expect(self.json()).toMatchObject({
      error: { fields: [{ path: 'zones.0.action.layoutId', reason: 'self' }] },
    });
    const invalidIdle = await editor.patch(api(`/layouts/${own.id}`), { idleSeconds: 5 });
    expect(invalidIdle.statusCode).toBe(400);
  });

  it('follows taps only a few layouts deep; loops are harmless', async () => {
    // A chain of seven layouts: home -> l1 -> ... -> l6, and l6 back to home.
    const chain = [await createLayout('L6', [zone('A')])];
    for (let i = 5; i >= 1; i--) {
      chain.unshift(
        await createLayout(`L${String(i)}`, [
          zone('Next', { action: { type: 'layout', layoutId: chain[0]!.id } }),
        ]),
      );
    }
    const home = await createLayout('Home', [
      zone('Next', { action: { type: 'layout', layoutId: chain[0]!.id } }),
    ]);
    const last = chain[chain.length - 1]!;
    await editor.patch(api(`/layouts/${last.id}`), {
      zones: [zone('Home', { action: { type: 'layout', layoutId: home.id } })],
    });

    const manifest = await (await screenShowing(home.id)).manifest();
    // Home plus five taps deep: L1..L5. L6 is beyond the limit, so L5's tap does nothing.
    const ids = manifest.layouts.map((l) => l.id);
    expect(ids).toHaveLength(6);
    expect(ids).not.toContain(last.id);
    const l5 = manifest.layouts.find((l) => l.id === chain[4]!.id)!;
    expect(l5.zones[0]?.action).toBeUndefined();
  });

  it('copies actions and idle time when a layout is duplicated', async () => {
    const map = await createLayout('Map', [zone('A')]);
    const home = await createLayout(
      'Home',
      [zone('Go', { action: { type: 'layout', layoutId: map.id }, label: 'Map' })],
      { idleSeconds: 90 },
    );
    const copy = await editor.post(api(`/layouts/${home.id}/duplicate`), { name: 'Copy' });
    expect(copy.json()).toMatchObject({
      layout: {
        idleSeconds: 90,
        zones: [{ action: { type: 'layout', layoutId: map.id }, label: 'Map' }],
      },
    });
  });
});
