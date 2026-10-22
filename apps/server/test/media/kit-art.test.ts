// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '../support/harness.js';
import {
  createHarness,
  insertOrg,
  insertUser,
  login,
  mediaIntegrationEnabled,
  type Harness,
} from '../support/harness.js';

interface MediaItem {
  id: string;
  name: string;
  status: string;
  attribution: string | null;
}

describe.runIf(mediaIntegrationEnabled)('starter kit art', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;
  let other: Client;

  afterEach(async () => {
    await h.close();
  });

  const api = (path: string, org = orgId) => `/api/v1/orgs/${org}${path}`;

  async function setup() {
    h = await createHarness({}, { media: true });
    orgId = await insertOrg(h.db, await insertUser(h.db, 'owner@example.com'), 'Org', false);
    otherOrgId = await insertOrg(h.db, await insertUser(h.db, 'other@example.com'), 'Other', false);
    const editorId = await insertUser(h.db, 'editor@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    editor = await login(h.app, 'editor@example.com');
    other = await login(h.app, 'other@example.com');
  }

  const art = async (client: Client, org: string) =>
    (await client.get(api('/media', org)))
      .json<{ media: MediaItem[] }>()
      .media.filter((item) => item.attribution === 'Rubinny Art Pack (CC0)');

  async function waitReady(ids: string[]) {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const items = (await art(editor, orgId)).filter((item) => ids.includes(item.id));
      if (items.every((item) => !['uploading', 'queued', 'processing'].includes(item.status))) {
        return items;
      }
      if (Date.now() > deadline) throw new Error('art is still being processed');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  it('creates the kit without art at once when the storage is down', async () => {
    await setup();
    const put = vi.spyOn(h.storage!, 'put').mockRejectedValue(new Error('storage is down'));
    const res = await editor.post(api('/starter-kits/restaurant'), { locale: 'en' });
    expect(res.statusCode).toBe(201);
    // One failed write, not one per picture (each would wait for its retries).
    expect(put).toHaveBeenCalledTimes(1);
    expect(await art(editor, orgId)).toEqual([]);
  });

  it('adds the art of a kit to the media library once, and points the designs at it', async () => {
    await setup();
    const res = await editor.post(api('/starter-kits/restaurant'), { locale: 'he' });
    expect(res.statusCode, res.body).toBe(201);

    const added = await art(editor, orgId);
    expect(added.map((item) => item.name).sort()).toEqual(
      ['ערב חמים (איור)', 'מנת סטייק (איור)'].sort(),
    );
    const ready = await waitReady(added.map((item) => item.id));
    expect(ready.map((item) => item.status)).toEqual(['ready', 'ready']);

    const widgets = (await editor.get(api('/widgets'))).json<{
      widgets: { id: string; type: string; name: string }[];
    }>().widgets;
    const special = widgets.find((widget) => widget.name === 'מנת היום')!;
    const { widget } = (await editor.get(api(`/widgets/${special.id}`))).json<{
      widget: {
        config: { backgroundMediaId: string; elements: { kind: string; mediaId?: string }[] };
      };
    }>();
    const byName = new Map(added.map((item) => [item.name, item.id]));
    expect(widget.config.backgroundMediaId).toBe(byName.get('ערב חמים (איור)'));
    expect(widget.config.elements.find((e) => e.kind === 'image')?.mediaId).toBe(
      byName.get('מנת סטייק (איור)'),
    );

    // The same kit again (in English) reuses the organization's copies.
    expect((await editor.post(api('/starter-kits/restaurant'), { locale: 'en' })).statusCode).toBe(
      201,
    );
    expect((await art(editor, orgId)).map((item) => item.id).sort()).toEqual(
      added.map((item) => item.id).sort(),
    );

    // Another organization gets its own copies, never this one's.
    expect(
      (await other.post(api('/starter-kits/restaurant', otherOrgId), { locale: 'en' })).statusCode,
    ).toBe(201);
    const theirs = await art(other, otherOrgId);
    expect(theirs).toHaveLength(2);
    expect(
      theirs.some((item) => byName.has(item.name) || added.some((a) => a.id === item.id)),
    ).toBe(false);
  });
});
