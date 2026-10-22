// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseManifest, type ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  login,
  mediaIntegrationEnabled,
  type Harness,
} from '../support/harness.js';

const CC0 = '11111111-1111-4111-8111-111111111111';
const BY = '22222222-2222-4222-8222-222222222222';
const MATURE = '33333333-3333-4333-8333-333333333333';

describe.runIf(mediaIntegrationEnabled)('free stock images and designs', () => {
  let library: http.Server;
  let base: string;
  let hits: string[] = [];
  let png: Buffer;

  const record = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: 'Sunset over the sea',
    url: `${base}/files/${id}.png`,
    creator: 'Jane Doe',
    license: 'cc0',
    license_version: '1.0',
    provider: 'flickr',
    foreign_landing_url: 'https://example.org/photo/1',
    width: 64,
    height: 32,
    filetype: 'png',
    mature: false,
    ...extra,
  });

  beforeAll(async () => {
    png = await sharp({
      create: { width: 64, height: 32, channels: 3, background: { r: 200, g: 80, b: 20 } },
    })
      .png()
      .toBuffer();
    library = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://x');
      hits.push(url.pathname);
      if (url.pathname === '/v1/images/') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            result_count: 3,
            page_count: 1,
            page: Number(url.searchParams.get('page')),
            results: [record(CC0), record(BY, { license: 'by' }), record(MATURE, { mature: true })],
          }),
        );
      } else if (url.pathname === `/v1/images/${CC0}/`) {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(record(CC0)));
      } else if (url.pathname === `/v1/images/${BY}/`) {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(record(BY, { license: 'by' })));
      } else if (url.pathname === `/v1/images/${CC0}/thumb/`) {
        response.writeHead(200, { 'content-type': 'image/png' }).end(png);
      } else if (url.pathname === `/v1/images/${BY}/thumb/`) {
        response.writeHead(200, { 'content-type': 'image/png' }).end('<svg onload=alert(1)>');
      } else if (url.pathname === `/files/${CC0}.png`) {
        response.writeHead(200, { 'content-type': 'image/png' }).end(png);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => library.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((library.address() as AddressInfo).port)}`;
  });
  afterAll(
    () =>
      new Promise<void>((resolve) =>
        library.close(() => {
          resolve();
        }),
      ),
  );

  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;

  async function setup(env: Record<string, string> = {}) {
    hits = [];
    h = await createHarness(
      { STOCK_API_URL: `${base}/v1`, WIDGET_FETCH_ALLOW_PRIVATE: 'true', ...env },
      { media: true },
    );
    orgId = await insertOrg(h.db, await insertUser(h.db, 'owner@example.com'), 'Org', false);
    otherOrgId = await insertOrg(h.db, await insertUser(h.db, 'other@example.com'), 'Other', false);
    const editorId = await insertUser(h.db, 'editor@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    editor = await login(h.app, 'editor@example.com');
  }
  afterEach(async () => {
    await h.close();
  });

  const api = (path: string, org = orgId) => `/api/v1/orgs/${org}${path}`;

  async function waitReady(id: string) {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const media = (await editor.get(api(`/media/${id}`))).json<{
        media: { status: string; attribution: string | null; sourceUrl: string | null };
      }>().media;
      if (!['uploading', 'queued', 'processing'].includes(media.status)) return media;
      if (Date.now() > deadline) throw new Error(`media stuck in ${media.status}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  it('searches public-domain images only, with caching', async () => {
    await setup();
    const res = await editor.get(api('/stock/images?q=sunset'));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      page: 1,
      results: [{ id: CC0, title: 'Sunset over the sea', creator: 'Jane Doe', license: 'cc0' }],
    });
    expect(res.json<{ results: unknown[] }>().results).toHaveLength(1);
    await editor.get(api('/stock/images?q=SUNSET'));
    expect(hits.filter((p) => p === '/v1/images/')).toHaveLength(1);
    expect((await editor.get(api('/stock/images?q='))).statusCode).toBe(400);
  });

  it('proxies thumbnails and refuses non-images', async () => {
    await setup();
    const thumb = await editor.get(api(`/stock/images/${CC0}/thumb`));
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/png');
    expect((await editor.get(api(`/stock/images/${BY}/thumb`))).statusCode).toBe(502);
  });

  it('imports through the scan pipeline with a credit line; licensed images are refused', async () => {
    await setup();
    const res = await editor.post(api(`/stock/images/${CC0}/import`));
    expect(res.statusCode, res.body).toBe(202);
    const { media } = res.json<{ media: { id: string; name: string } }>();
    expect(media.name).toBe('Sunset over the sea');
    const ready = await waitReady(media.id);
    expect(ready).toMatchObject({
      status: 'ready',
      sourceUrl: 'https://example.org/photo/1',
      attribution: 'Sunset over the sea — Jane Doe (CC0, via flickr)',
    });
    expect((await editor.post(api(`/stock/images/${BY}/import`))).statusCode).toBe(404);
  });

  it('is hidden when disabled and closed to other organizations', async () => {
    await setup({ STOCK_IMAGES_ENABLED: 'false' });
    expect((await editor.get(api('/stock/images?q=sunset'))).statusCode).toBe(404);
    expect((await editor.get(api('/stock/images?q=sunset', otherOrgId))).statusCode).toBe(404);
  });

  it('saves designs that use own images and ships those images to screens', async () => {
    await setup();
    const imported = (await editor.post(api(`/stock/images/${CC0}/import`))).json<{
      media: { id: string };
    }>().media;
    await waitReady(imported.id);
    const foreign = await h.db
      .insertInto('media')
      .values({
        org_id: otherOrgId,
        name: 'x',
        original_filename: 'x.png',
        kind: 'image',
        mime: 'image/png',
        size_bytes: 1,
        sha256: 'b'.repeat(64),
        status: 'ready',
        storage_key: 'k',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const design = (mediaId: string) => ({
      type: 'design',
      name: 'Promo',
      config: {
        elements: [
          { id: 'bg', kind: 'shape', x: 0, y: 0, w: 1920, h: 1080, fill: '#111827' },
          { id: 'img', kind: 'image', x: 100, y: 100, w: 640, h: 320, mediaId },
          { id: 'title', kind: 'text', x: 800, y: 100, w: 900, h: 200, text: 'יום פתוח' },
        ],
      },
    });
    const bad = await editor.post(api('/widgets'), design(foreign.id));
    expect(bad.json()).toMatchObject({ error: { fields: [{ path: 'config.elements' }] } });
    const ok = await editor.post(api('/widgets'), design(imported.id));
    expect(ok.statusCode, ok.body).toBe(201);
    const widgetId = ok.json<{ widget: { id: string } }>().widget.id;

    const playlist = (await editor.post(api('/playlists'), { name: 'P' })).json<{
      playlist: { id: string };
    }>().playlist;
    await editor.put(api(`/playlists/${playlist.id}/items`), {
      items: [{ widgetId, durationMs: null }],
    });
    const player = new Client(h.app, '203.0.113.10');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    await editor.post(api('/screens'), { code: start.code, name: 'S', playlistId: playlist.id });
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();
    const res = await h.app.inject({
      method: 'GET',
      url: '/player/v1/manifest',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(parseManifest(res.json()).success).toBe(true);
    const manifest = res.json<ManifestV1>();
    expect(manifest.media.map((m) => m.id)).toEqual([imported.id]);
    expect(manifest.widgets[0]).toMatchObject({ type: 'design' });
    // The device may download the image (same organization, ready).
    const file = await h.app.inject({
      method: 'GET',
      url: `/player/v1/media/${imported.id}`,
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(file.statusCode).toBe(200);
  });
});
