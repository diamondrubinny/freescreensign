// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Group {
  id: string;
  name: string;
  screenIds: string[];
}

describe.runIf(integrationEnabled)('screen groups', () => {
  let h: Harness;
  let orgId: string;
  let admin: Client;
  let editor: Client;
  let viewer: Client;
  let events: string[];

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    for (const [email, role] of [
      ['editor@school.example', 'EDITOR'],
      ['viewer@school.example', 'VIEWER'],
    ] as const) {
      const id = await insertUser(h.db, email, { name: role === 'EDITOR' ? 'Noa' : 'Dan' });
      await h.db.insertInto('memberships').values({ org_id: orgId, user_id: id, role }).execute();
    }
    admin = await login(h.app, 'admin@school.example');
    editor = await login(h.app, 'editor@school.example');
    viewer = await login(h.app, 'viewer@school.example');
    events = [];
    h.events.onEvent((screenId, event) => {
      events.push(`${screenId}:${event.type}`);
    });
  });
  afterEach(() => h.close());

  async function pairScreen(name: string, client = admin, org = orgId) {
    const player = new Client(h.app, '203.0.113.80');
    const { code } = (await player.post('/player/v1/pair/start')).json<{ code: string }>();
    const res = await client.post(api('/screens', org), { code, name });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ screen: { id: string } }>().screen.id;
  }

  async function playlist(name: string) {
    return (await admin.post(api('/playlists'), { name })).json<{ playlist: { id: string } }>()
      .playlist.id;
  }

  it('groups screens, lists them both ways and keeps names unique', async () => {
    const [hall, lobby, office] = [
      await pairScreen('Hall'),
      await pairScreen('Lobby'),
      await pairScreen('Office'),
    ];
    const created = await editor.post(api('/screen-groups'), {
      name: 'Floor 2',
      screenIds: [hall, lobby, hall],
    });
    expect(created.statusCode, created.body).toBe(201);
    const group = created.json<{ group: Group }>().group;
    expect(group).toMatchObject({ name: 'Floor 2', screenIds: [hall, lobby] });

    const listed = (await viewer.get(api('/screen-groups'))).json<{ groups: Group[] }>().groups;
    expect(listed.map((g) => ({ ...g, screenIds: [...g.screenIds].sort() }))).toEqual([
      { id: group.id, name: 'Floor 2', screenIds: [hall, lobby].sort() },
    ]);
    const screens = (await viewer.get(api('/screens'))).json<{
      screens: { id: string; groupIds: string[] }[];
    }>().screens;
    expect(screens.find((s) => s.id === hall)?.groupIds).toEqual([group.id]);
    expect(screens.find((s) => s.id === office)?.groupIds).toEqual([]);

    // Names are unique per organization, whatever the case.
    const again = await editor.post(api('/screen-groups'), { name: 'floor 2' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { fields: [{ path: 'name', reason: 'taken' }] } });

    const renamed = await editor.patch(api(`/screen-groups/${group.id}`), {
      name: 'Second floor',
      screenIds: [office],
    });
    expect(renamed.json()).toMatchObject({ group: { name: 'Second floor', screenIds: [office] } });
    // Viewers only look.
    expect((await viewer.post(api('/screen-groups'), { name: 'X' })).statusCode).toBe(403);
    expect((await viewer.delete(api(`/screen-groups/${group.id}`))).statusCode).toBe(403);
  });

  it('gives every screen of a group the same content at once, and tells each screen', async () => {
    const [hall, lobby, office] = [
      await pairScreen('Hall'),
      await pairScreen('Lobby'),
      await pairScreen('Office'),
    ];
    const group = (
      await editor.post(api('/screen-groups'), { name: 'Floor 2', screenIds: [hall, lobby] })
    ).json<{ group: Group }>().group;
    const news = await playlist('News');
    await settle();
    events.length = 0;
    const res = await editor.put(api(`/screen-groups/${group.id}/content`), { playlistId: news });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ updated: 2 });
    await settle();
    expect(events.sort()).toEqual([`${hall}:manifest.changed`, `${lobby}:manifest.changed`].sort());
    const screens = (await admin.get(api('/screens'))).json<{
      screens: { id: string; playlistId: string | null }[];
    }>().screens;
    expect(Object.fromEntries(screens.map((s) => [s.id, s.playlistId]))).toEqual({
      [hall]: news,
      [lobby]: news,
      [office]: null,
    });

    // Deleting the group leaves the screens as they are.
    expect((await editor.delete(api(`/screen-groups/${group.id}`))).statusCode).toBe(204);
    const after = (await admin.get(api('/screens'))).json<{
      screens: { id: string; playlistId: string | null; groupIds: string[] }[];
    }>().screens;
    expect(after.find((s) => s.id === hall)).toMatchObject({ playlistId: news, groupIds: [] });
    // A deleted screen leaves its groups.
    const other = (
      await editor.post(api('/screen-groups'), { name: 'Office', screenIds: [office] })
    ).json<{ group: Group }>().group;
    await admin.delete(api(`/screens/${office}`));
    expect((await admin.get(api('/screen-groups'))).json()).toEqual({
      groups: [{ id: other.id, name: 'Office', screenIds: [] }],
    });
  });

  it('never mixes organizations: screens, content and groups', async () => {
    const otherOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'other@example.com'),
      'Other',
      false,
    );
    const other = await login(h.app, 'other@example.com');
    const foreignScreen = await pairScreen('Foreign', other, otherOrg);
    const foreignPlaylist = (
      await other.post(api('/playlists', otherOrg), { name: 'Foreign' })
    ).json<{ playlist: { id: string } }>().playlist.id;
    const mine = await pairScreen('Hall');

    const bad = await editor.post(api('/screen-groups'), {
      name: 'Mixed',
      screenIds: [mine, foreignScreen],
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({
      error: { fields: [{ path: 'screenIds.1', reason: 'invalid' }] },
    });
    const group = (
      await editor.post(api('/screen-groups'), { name: 'Mine', screenIds: [mine] })
    ).json<{ group: Group }>().group;
    const content = await editor.put(api(`/screen-groups/${group.id}/content`), {
      playlistId: foreignPlaylist,
    });
    expect(content.statusCode).toBe(400);
    expect(content.json()).toMatchObject({ error: { fields: [{ path: 'playlistId' }] } });
    // Another organization sees nothing and changes nothing.
    expect((await other.get(api('/screen-groups', otherOrg))).json()).toEqual({ groups: [] });
    for (const org of [otherOrg, orgId]) {
      expect(
        (await other.patch(api(`/screen-groups/${group.id}`, org), { name: 'x' })).statusCode,
      ).toBe(404);
    }
    // The same name is fine in another organization.
    expect((await other.post(api('/screen-groups', otherOrg), { name: 'Mine' })).statusCode).toBe(
      201,
    );
  });

  it('holds an editor’s content change for an admin when approval is required', async () => {
    const hall = await pairScreen('Hall');
    const group = (
      await editor.post(api('/screen-groups'), { name: 'Floor 2', screenIds: [hall] })
    ).json<{ group: Group }>().group;
    const news = await playlist('News');
    await admin.patch(api(), { requireApproval: true });

    // Naming and choosing screens changes nothing on screen: not held.
    expect(
      (await editor.patch(api(`/screen-groups/${group.id}`), { name: 'Floor two' })).statusCode,
    ).toBe(200);
    const held = await editor.put(api(`/screen-groups/${group.id}/content`), { playlistId: news });
    expect(held.statusCode, held.body).toBe(202);
    expect(held.json()).toMatchObject({
      approval: { summary: { kind: 'screenGroup', name: 'Floor two', action: 'update' } },
    });
    const playlistOf = async () =>
      (
        await h.db
          .selectFrom('screens')
          .select('playlist_id')
          .where('id', '=', hall)
          .executeTakeFirstOrThrow()
      ).playlist_id;
    expect(await playlistOf()).toBeNull();
    // While it waits, the editor adds another screen to the group (not held).
    const lobby = await pairScreen('Lobby');
    expect(
      (await editor.patch(api(`/screen-groups/${group.id}`), { screenIds: [hall, lobby] }))
        .statusCode,
    ).toBe(200);
    const { approval } = held.json<{ approval: { id: string } }>();
    expect((await admin.post(api(`/approvals/${approval.id}/approve`))).statusCode).toBe(200);
    expect(await playlistOf()).toBe(news);
    // The approval covers the screens of the request, not those added since.
    const lobbyRow = await h.db
      .selectFrom('screens')
      .select('playlist_id')
      .where('id', '=', lobby)
      .executeTakeFirstOrThrow();
    expect(lobbyRow.playlist_id).toBeNull();
  });
});
