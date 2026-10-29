// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseManifest, type ManifestV1, type SacredTimes } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

const JERUSALEM = {
  place: {
    name: 'ירושלים',
    latitude: 31.76904,
    longitude: 35.21633,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  candleMinutes: 40,
};

describe.runIf(integrationEnabled)('scheduling by Shabbat and holidays', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let owner: Client;
  let editor: Client;
  let outsider: Client;
  let published: string[];

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'owner@shop.example'), 'Shop', false);
    const editorId = await insertUser(h.db, 'editor@shop.example');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    otherOrgId = await insertOrg(
      h.db,
      await insertUser(h.db, 'outsider@other.example'),
      'Other',
      false,
    );
    owner = await login(h.app, 'owner@shop.example');
    editor = await login(h.app, 'editor@shop.example');
    outsider = await login(h.app, 'outsider@other.example');
    published = [];
    vi.spyOn(h.events, 'publish').mockImplementation((screenId) => {
      published.push(screenId);
      return Promise.resolve();
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await h.close();
  });

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;

  async function pair(): Promise<{ deviceToken: string; screenId: string }> {
    const player = new Client(h.app, '203.0.113.20');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    expect(
      (await owner.post(api('/screens'), { code: start.code, name: 'Window' })).statusCode,
    ).toBe(201);
    return (await player.post('/player/v1/pair/status', { pollToken: start.pollToken })).json();
  }

  const manifestOf = async (token: string) => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/player/v1/manifest',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(parseManifest(res.json()).success).toBe(true);
    return res.json<ManifestV1>();
  };

  it('lets admins set the place (others only read it), and tells every screen', async () => {
    expect((await editor.get(api('/settings/sacred'))).json()).toEqual({ settings: null });
    expect((await editor.put(api('/settings/sacred'), { settings: JERUSALEM })).statusCode).toBe(
      403,
    );
    expect(
      (
        await owner.put(api('/settings/sacred'), {
          settings: { ...JERUSALEM, startOffsetMinutes: 999 },
        })
      ).statusCode,
    ).toBe(400);
    const { screenId } = await pair();
    published = [];
    const saved = await owner.put(api('/settings/sacred'), { settings: JERUSALEM });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      settings: { candleMinutes: 40, havdalah: 'tzeit', startOffsetMinutes: 0 },
    });
    expect(published).toContain(screenId);
    expect((await editor.get(api('/settings/sacred'))).json()).toMatchObject({
      settings: { place: { name: 'ירושלים' } },
    });
    // Another organization sees none of it.
    expect((await outsider.get(api('/settings/sacred'))).statusCode).toBe(404);
    expect((await outsider.get(api('/settings/sacred', otherOrgId))).json()).toEqual({
      settings: null,
    });
    // Cleared again.
    expect((await owner.put(api('/settings/sacred'), { settings: null })).json()).toEqual({
      settings: null,
    });
  });

  it('gives the periods for the timeline in the place’s time zone', async () => {
    expect((await editor.get(api('/sacred-times'))).json()).toEqual({
      timeZone: null,
      times: null,
    });
    await owner.put(api('/settings/sacred'), { settings: JERUSALEM });
    const res = await editor.get(api('/sacred-times?from=2026-11-01&days=7'));
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{ timeZone: string; times: SacredTimes }>();
    expect(body.timeZone).toBe('Asia/Jerusalem');
    // The days asked for (and a period that has just ended, as for screens).
    expect(body.times.periods.map((period) => period.start)).toEqual([
      '2026-10-30T14:11:00.000Z',
      '2026-11-06T14:05:00.000Z',
    ]);
    expect(body.times.periods[1]).toMatchObject({
      start: '2026-11-06T14:05:00.000Z',
      end: '2026-11-07T15:23:00.000Z',
      kinds: ['shabbat'],
    });
    expect((await editor.get(api('/sacred-times?days=400'))).statusCode).toBe(400);
  });

  it('needs the place before rules can depend on Shabbat, then sends the periods to screens', async () => {
    const playlist = (await editor.post(api('/playlists'), { name: 'Closed on Shabbat' })).json<{
      playlist: { id: string };
    }>().playlist.id;
    const entry = { name: 'Shabbat', playlistId: playlist, sacred: 'only' };
    const refused = await editor.post(api('/schedules'), { name: 'Shop', entries: [entry] });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({
      error: { fields: [{ path: 'entries.0.sacred', reason: 'sacred_unavailable' }] },
    });

    await owner.put(api('/settings/sacred'), { settings: JERUSALEM });
    const created = await editor.post(api('/schedules'), { name: 'Shop', entries: [entry] });
    expect(created.statusCode, created.body).toBe(201);
    const scheduleId = created.json<{ schedule: { id: string } }>().schedule.id;
    const detail = (await editor.get(api(`/schedules/${scheduleId}`))).json<{
      schedule: { entries: { sacred: string | null }[] };
    }>();
    expect(detail.schedule.entries[0]?.sacred).toBe('only');
    // A copy keeps the condition.
    const copy = await editor.post(api(`/schedules/${scheduleId}/duplicate`), { name: 'Copy' });
    const copyId = copy.json<{ schedule: { id: string } }>().schedule.id;
    expect(
      (await editor.get(api(`/schedules/${copyId}`))).json<{
        schedule: { entries: { sacred: string | null }[] };
      }>().schedule.entries[0]?.sacred,
    ).toBe('only');

    // A screen on this schedule gets the condition and the periods.
    const { deviceToken, screenId } = await pair();
    const plain = await manifestOf(deviceToken);
    expect(plain.sacredTimes).toBeUndefined();
    await owner.patch(api(`/screens/${screenId}`), { scheduleId });
    const manifest = await manifestOf(deviceToken);
    expect(manifest.schedule.entries[0]).toMatchObject({ sacred: 'only' });
    expect(manifest.sacredTimes?.periods.length).toBeGreaterThan(0);
    expect(Date.parse(manifest.sacredTimes!.until)).toBeGreaterThan(Date.now() + 50 * 86_400_000);
  });

  it('checks item windows the same way', async () => {
    const widget = (
      await editor.post(api('/widgets'), { type: 'clock', name: 'Clock', config: {} })
    ).json<{ widget: { id: string } }>().widget.id;
    const playlist = (await editor.post(api('/playlists'), { name: 'Week' })).json<{
      playlist: { id: string };
    }>().playlist.id;
    const items = { items: [{ widgetId: widget, durationMs: null, window: { sacred: 'skip' } }] };
    const refused = await editor.put(api(`/playlists/${playlist}/items`), items);
    expect(refused.json()).toMatchObject({
      error: { fields: [{ path: 'items.0.window.sacred', reason: 'sacred_unavailable' }] },
    });
    await owner.put(api('/settings/sacred'), { settings: JERUSALEM });
    expect((await editor.put(api(`/playlists/${playlist}/items`), items)).statusCode).toBe(200);

    const { deviceToken, screenId } = await pair();
    await owner.patch(api(`/screens/${screenId}`), { playlistId: playlist });
    const manifest = await manifestOf(deviceToken);
    expect(manifest.playlists[0]?.items[0]?.window).toMatchObject({ sacred: 'skip' });
    expect(manifest.sacredTimes).toBeDefined();
  });
});
