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

describe.runIf(integrationEnabled)('video walls', () => {
  let h: Harness;
  let orgId: string;
  let admin: Client;
  const api = (path = '') => `/api/v1/orgs/${orgId}${path}`;

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    admin = await login(h.app, 'admin@school.example');
  });
  afterEach(() => h.close());

  it('places a screen in a wall, serves it in the manifest and clears it', async () => {
    const player = new Client(h.app, '203.0.113.60');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const created = await admin.post(api('/screens'), { code: start.code, name: 'Wall 2' });
    const screenId = created.json<{ screen: { id: string; wall: unknown } }>().screen.id;
    expect(created.json()).toMatchObject({ screen: { wall: null } });
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();
    const manifest = async () => {
      const res = await h.app.inject({
        url: '/player/v1/manifest',
        headers: { authorization: `Bearer ${deviceToken}` },
      });
      expect(parseManifest(res.json()).success).toBe(true);
      return res.json<ManifestV1>();
    };
    expect((await manifest()).screen.wall).toBeUndefined();

    const wall = { columns: 2, rows: 2, column: 1, row: 0, bezelX: 24 };
    const placed = await admin.patch(api(`/screens/${screenId}`), { wall });
    expect(placed.statusCode, placed.body).toBe(200);
    expect(placed.json()).toMatchObject({ screen: { wall: { ...wall, bezelY: 0 } } });
    expect((await manifest()).screen.wall).toEqual({ ...wall, bezelY: 0 });

    // A cell outside the grid is refused with the field that is wrong.
    const outside = await admin.patch(api(`/screens/${screenId}`), {
      wall: { columns: 2, rows: 2, column: 2, row: 0 },
    });
    expect(outside.statusCode).toBe(400);
    expect(outside.json()).toMatchObject({ error: { fields: [{ path: 'wall.column' }] } });
    const tooBig = await admin.patch(api(`/screens/${screenId}`), {
      wall: { columns: 9, rows: 1, column: 0, row: 0 },
    });
    expect(tooBig.statusCode).toBe(400);

    await admin.patch(api(`/screens/${screenId}`), { wall: null });
    expect((await manifest()).screen.wall).toBeUndefined();
  });
});
