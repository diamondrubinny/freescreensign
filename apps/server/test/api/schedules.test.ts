// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeLayoutId, parseManifest, templateZones, type ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface ScheduleDetail {
  id: string;
  name: string;
  screens: { id: string; name: string; timezone: string }[];
  entries: {
    id: string;
    name: string;
    layoutId: string | null;
    layoutName: string | null;
    playlistId: string | null;
    playlistName: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    daysOfWeek: number[];
    timeFrom: string | null;
    timeTo: string | null;
    enabled: boolean;
  }[];
}

describe.runIf(integrationEnabled)('schedules', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;
  let viewer: Client;
  let outsider: Client;
  let published: string[];

  beforeEach(async () => {
    h = await createHarness();
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

  async function createPlaylist(client: Client, name: string, org = orgId) {
    const res = await client.post(api('/playlists', org), { name });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ playlist: { id: string } }>().playlist.id;
  }

  async function createLayout(name: string, playlistId: string | null) {
    const zones = templateZones('fullscreen', { width: 1920, height: 1080 });
    const res = await editor.post(api('/layouts'), {
      name,
      width: 1920,
      height: 1080,
      zones: [{ ...zones[0], playlistId }],
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ layout: { id: string } }>().layout.id;
  }

  async function pair(name = 'Lobby'): Promise<{ deviceToken: string; screenId: string }> {
    const player = new Client(h.app, '203.0.113.10');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    expect((await editor.post(api('/screens'), { code: start.code, name })).statusCode).toBe(201);
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

  it('creates, reads, updates, duplicates and deletes schedules', async () => {
    const breakfast = await createLayout('Breakfast', null);
    const promo = await createPlaylist(editor, 'Promo');

    const created = await editor.post(api('/schedules'), {
      name: '  Cafeteria ',
      entries: [
        {
          name: 'Friday promo',
          playlistId: promo,
          daysOfWeek: [5, 5],
          dateFrom: '2026-10-01',
          dateTo: '2026-12-31',
        },
        { name: 'Breakfast', layoutId: breakfast, timeFrom: '06:00', timeTo: '11:00' },
      ],
    });
    expect(created.statusCode, created.body).toBe(201);
    const schedule = created.json<{ schedule: ScheduleDetail }>().schedule;
    expect(schedule.name).toBe('Cafeteria');
    expect(schedule.entries).toEqual([
      expect.objectContaining({
        name: 'Friday promo',
        playlistId: promo,
        playlistName: 'Promo',
        layoutId: null,
        daysOfWeek: [5],
        dateFrom: '2026-10-01',
        dateTo: '2026-12-31',
        timeFrom: null,
        enabled: true,
      }),
      expect.objectContaining({
        name: 'Breakfast',
        layoutId: breakfast,
        layoutName: 'Breakfast',
        daysOfWeek: [],
        timeFrom: '06:00',
        timeTo: '11:00',
      }),
    ]);

    const list = (await viewer.get(api('/schedules'))).json<{
      schedules: { id: string; entryCount: number; screenCount: number }[];
    }>();
    expect(list.schedules).toEqual([
      expect.objectContaining({ id: schedule.id, entryCount: 2, screenCount: 0 }),
    ]);
    expect((await viewer.get(api(`/schedules/${schedule.id}`))).statusCode).toBe(200);

    // Reordering is a full replacement; the new order is the new priority.
    const reordered = await editor.patch(api(`/schedules/${schedule.id}`), {
      entries: [schedule.entries[1], { ...schedule.entries[0], enabled: false }],
    });
    expect(reordered.statusCode, reordered.body).toBe(200);
    expect(
      reordered
        .json<{ schedule: ScheduleDetail }>()
        .schedule.entries.map((e) => [e.name, e.enabled]),
    ).toEqual([
      ['Breakfast', true],
      ['Friday promo', false],
    ]);

    const copy = await editor.post(api(`/schedules/${schedule.id}/duplicate`), { name: 'Copy' });
    expect(copy.statusCode).toBe(201);
    const copied = copy.json<{ schedule: ScheduleDetail }>().schedule;
    expect(copied.entries.map((e) => [e.name, e.dateTo, e.enabled])).toEqual([
      ['Breakfast', null, true],
      ['Friday promo', '2026-12-31', false],
    ]);

    expect((await editor.delete(api(`/schedules/${copied.id}`))).statusCode).toBe(204);
    expect((await viewer.get(api(`/schedules/${copied.id}`))).statusCode).toBe(404);

    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('target_type', '=', 'schedule')
      .orderBy('created_at')
      .execute();
    expect(audit.map((a) => a.action)).toEqual([
      'schedule.created',
      'schedule.updated',
      'schedule.created',
      'schedule.deleted',
    ]);
  });

  it('validates entries and enforces roles and organization boundaries', async () => {
    const own = await createPlaylist(editor, 'Own');
    const foreign = await createPlaylist(outsider, 'Foreign', otherOrgId);

    const invalid = [
      { name: 'No content' },
      { name: 'Both', playlistId: own, layoutId: own },
      { name: 'Reversed', playlistId: own, dateFrom: '2026-10-02', dateTo: '2026-10-01' },
      { name: 'Half window', playlistId: own, timeFrom: '08:00' },
      { name: 'Empty window', playlistId: own, timeFrom: '08:00', timeTo: '08:00' },
      { name: 'Bad day', playlistId: own, daysOfWeek: [7] },
    ];
    for (const entry of invalid) {
      const res = await editor.post(api('/schedules'), { name: 'S', entries: [entry] });
      expect(res.statusCode, entry.name).toBe(400);
    }
    const tooMany = Array.from({ length: 101 }, () => ({ name: 'x', playlistId: own }));
    expect((await editor.post(api('/schedules'), { name: 'S', entries: tooMany })).statusCode).toBe(
      400,
    );

    // Content of another organization is rejected and pinpointed.
    const cross = await editor.post(api('/schedules'), {
      name: 'S',
      entries: [
        { name: 'ok', playlistId: own },
        { name: 'x', playlistId: foreign },
      ],
    });
    expect(cross.statusCode).toBe(400);
    expect(cross.json<{ error: { fields: { path: string }[] } }>().error.fields).toEqual([
      expect.objectContaining({ path: 'entries.1.playlistId' }),
    ]);

    // Viewers read only; outsiders see nothing.
    expect((await viewer.post(api('/schedules'), { name: 'S' })).statusCode).toBe(403);
    const { schedule } = (await editor.post(api('/schedules'), { name: 'S' })).json<{
      schedule: ScheduleDetail;
    }>();
    expect((await viewer.patch(api(`/schedules/${schedule.id}`), { name: 'T' })).statusCode).toBe(
      403,
    );
    expect((await viewer.delete(api(`/schedules/${schedule.id}`))).statusCode).toBe(403);
    // Non-members cannot even learn that the organization's schedule exists.
    expect((await outsider.get(api(`/schedules/${schedule.id}`))).statusCode).toBe(404);
    expect((await outsider.get(api(`/schedules/${schedule.id}`, otherOrgId))).statusCode).toBe(404);
    expect(
      (await outsider.patch(api(`/schedules/${schedule.id}`, otherOrgId), { name: 'T' }))
        .statusCode,
    ).toBe(404);

    // A screen cannot use another organization's schedule.
    const { screenId } = await pair();
    const { schedule: theirs } = (
      await outsider.post(api('/schedules', otherOrgId), { name: 'Theirs' })
    ).json<{ schedule: ScheduleDetail }>();
    const res = await editor.patch(api(`/screens/${screenId}`), { scheduleId: theirs.id });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { fields: { path: string }[] } }>().error.fields[0]?.path).toBe(
      'scheduleId',
    );
  });

  it('enforces the per-organization quota', async () => {
    await h.db
      .insertInto('schedules')
      .values(Array.from({ length: 200 }, (_, i) => ({ org_id: orgId, name: `S${String(i)}` })))
      .execute();
    expect((await editor.post(api('/schedules'), { name: 'One more' })).statusCode).toBe(409);
  });

  it('sends the schedule to the player and keeps screens up to date', async () => {
    const defaultPl = await createPlaylist(editor, 'Default');
    const lunchPl = await createPlaylist(editor, 'Lunch items');
    const promoPl = await createPlaylist(editor, 'Promo');
    const lunch = await createLayout('Lunch', lunchPl);
    const { deviceToken, screenId } = await pair();
    await editor.patch(api(`/screens/${screenId}`), { playlistId: defaultPl });

    const { schedule } = (
      await editor.post(api('/schedules'), {
        name: 'Cafeteria',
        entries: [
          { name: 'Promo', playlistId: promoPl, daysOfWeek: [5], dateFrom: '2026-10-01' },
          { name: 'Off', playlistId: promoPl, enabled: false },
          { name: 'Lunch', layoutId: lunch, timeFrom: '11:00', timeTo: '15:00' },
        ],
      })
    ).json<{ schedule: ScheduleDetail }>();

    published = [];
    const assigned = await editor.patch(api(`/screens/${screenId}`), { scheduleId: schedule.id });
    expect(assigned.json()).toMatchObject({
      screen: { scheduleId: schedule.id, scheduleName: 'Cafeteria' },
    });
    expect(published).toEqual([screenId]);

    const manifest = await manifestOf(deviceToken);
    expect(manifest.schedule.defaultLayoutId).toBe('default');
    expect(manifest.layouts.map((l) => l.id)).toEqual(['default', `playlist-${promoPl}`, lunch]);
    // Disabled entries are left out; the first entry has the highest priority.
    expect(manifest.schedule.entries).toEqual([
      {
        id: schedule.entries[0]!.id,
        layoutId: `playlist-${promoPl}`,
        priority: 2,
        daysOfWeek: [5],
        dateFrom: '2026-10-01',
      },
      {
        id: schedule.entries[2]!.id,
        layoutId: lunch,
        priority: 1,
        timeFrom: '11:00',
        timeTo: '15:00',
      },
    ]);
    expect(manifest.playlists.map((p) => p.id).sort()).toEqual(
      [defaultPl, lunchPl, promoPl].sort(),
    );
    // The player resolves what to show on the screen's own clock (Asia/Jerusalem, UTC+3).
    expect(activeLayoutId(manifest, new Date('2026-10-15T09:00:00Z'))).toBe(lunch); // Thu 12:00
    expect(activeLayoutId(manifest, new Date('2026-10-16T09:00:00Z'))).toBe(`playlist-${promoPl}`);
    expect(activeLayoutId(manifest, new Date('2026-10-15T16:00:00Z'))).toBe('default');

    // Changing the schedule, or content it shows, notifies the screen.
    published = [];
    await editor.patch(api(`/schedules/${schedule.id}`), {
      entries: [{ name: 'Lunch', layoutId: lunch, timeFrom: '11:00', timeTo: '14:00' }],
    });
    expect(published).toEqual([screenId]);
    published = [];
    await editor.patch(api(`/schedules/${schedule.id}`), { name: 'Renamed' });
    expect(published).toEqual([]);
    await editor.patch(api(`/layouts/${lunch}`), { background: '#123456' });
    expect(published).toEqual([screenId]);
    published = [];
    await editor.put(api(`/playlists/${lunchPl}/items`), { items: [] });
    expect(published).toEqual([screenId]);

    // Deleting a scheduled layout removes its entries and notifies the screen.
    published = [];
    expect((await editor.delete(api(`/layouts/${lunch}`))).statusCode).toBe(204);
    expect(published).toEqual([screenId]);
    expect((await manifestOf(deviceToken)).schedule.entries).toEqual([]);

    // Deleting the schedule returns the screen to its default content.
    await editor.patch(api(`/schedules/${schedule.id}`), {
      entries: [{ name: 'Promo', playlistId: promoPl }],
    });
    published = [];
    expect((await editor.delete(api(`/playlists/${promoPl}`))).statusCode).toBe(204);
    expect(published).toEqual([screenId]);
    published = [];
    expect((await editor.delete(api(`/schedules/${schedule.id}`))).statusCode).toBe(204);
    expect(published).toEqual([screenId]);
    const after = await manifestOf(deviceToken);
    expect(after.schedule.entries).toEqual([]);
    expect(after.layouts.map((l) => l.id)).toEqual(['default']);
    expect(
      (await editor.get(api('/screens'))).json<{ screens: { scheduleId: string | null }[] }>()
        .screens[0]?.scheduleId,
    ).toBeNull();
  });

  it('never sends another organization’s content, even if the database references it', async () => {
    const foreign = await createPlaylist(outsider, 'Foreign', otherOrgId);
    const { deviceToken, screenId } = await pair();
    const { schedule } = (await editor.post(api('/schedules'), { name: 'S' })).json<{
      schedule: ScheduleDetail;
    }>();
    await editor.patch(api(`/screens/${screenId}`), { scheduleId: schedule.id });
    // Simulate a corrupted reference that bypassed the API.
    await h.db
      .insertInto('schedule_entries')
      .values({ schedule_id: schedule.id, position: 0, name: 'x', playlist_id: foreign })
      .execute();
    const manifest = await manifestOf(deviceToken);
    expect(manifest.schedule.entries).toEqual([]);
    expect(manifest.playlists).toEqual([]);
  });
});
