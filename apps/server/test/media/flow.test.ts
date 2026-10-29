// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../../src/context.js';
import { Storage } from '../../src/lib/storage.js';
import { ingestMedia } from '../../src/media/ingest.js';
import { processMediaJob } from '../../src/worker/media-job.js';
import {
  type Client,
  createHarness,
  insertOrg,
  insertUser,
  login,
  mediaIntegrationEnabled,
  type Harness,
} from '../support/harness.js';
import { EICAR, hasFfmpeg, jpegWithExif, mp4, png } from './fixtures.js';

interface MediaDto {
  id: string;
  status: string;
  kind: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  failureReason: string | null;
  fileUrl?: string;
  thumbnailUrl?: string | null;
}

describe.runIf(mediaIntegrationEnabled)('media upload pipeline (S3 + ClamAV + worker)', () => {
  let h: Harness;
  let orgId: string;
  let editor: Client;

  async function setup(env: Record<string, string> = {}) {
    h = await createHarness(env, { media: true });
    const ownerId = await insertUser(h.db, 'owner@example.com');
    orgId = await insertOrg(h.db, ownerId, 'Org', false);
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

  const mediaUrl = () => `/api/v1/orgs/${orgId}/media`;

  async function waitFor(client: Client, id: string, timeoutMs = 30_000): Promise<MediaDto> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await client.get(`${mediaUrl()}/${id}`);
      const media = res.json<{ media: MediaDto }>().media;
      if (!['uploading', 'queued', 'processing'].includes(media.status)) return media;
      if (Date.now() > deadline)
        throw new Error(`timed out waiting for media, last status ${media.status}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  it('readiness: storage answers, an unreachable store does not', async () => {
    await setup();
    await expect(h.storage!.ping()).resolves.toBeUndefined();
    const unreachable = new Storage({
      endpoint: 'http://127.0.0.1:1',
      region: 'us-east-1',
      accessKeyId: 'x',
      secretAccessKey: 'y',
      forcePathStyle: true,
      quarantineBucket: 'q',
      mediaBucket: 'm',
    });
    await expect(unreachable.ping()).rejects.toThrow();
  });

  it('uploads, scans and sanitizes an image, then serves it with ranges', async () => {
    await setup();
    const res = await editor.upload(
      mediaUrl(),
      'תמונה משפחתית.jpg',
      await jpegWithExif(200, 100),
      'image/jpeg',
    );
    expect(res.statusCode).toBe(202);
    const queued = res.json<{ media: MediaDto }>().media;
    expect(queued.status).toBe('queued');

    const ready = await waitFor(editor, queued.id);
    expect(ready).toMatchObject({
      status: 'ready',
      kind: 'image',
      mime: 'image/jpeg',
      width: 100,
      height: 200,
    });

    const file = await editor.get(ready.fileUrl!);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['content-security-policy']).toContain('sandbox');
    expect(file.headers['content-disposition']).toContain("filename*=UTF-8''");
    const meta = await sharp(file.rawPayload).metadata();
    expect(meta.exif).toBeUndefined(); // EXIF (and any GPS) removed

    const partial = await editor.request('GET', ready.fileUrl!, undefined, { range: 'bytes=0-9' });
    expect(partial.statusCode).toBe(206);
    expect(partial.rawPayload).toHaveLength(10);
    expect(partial.headers['content-range']).toBe(`bytes 0-9/${ready.sizeBytes}`);
    const bad = await editor.request('GET', ready.fileUrl!, undefined, {
      range: `bytes=${ready.sizeBytes}-`,
    });
    expect(bad.statusCode).toBe(416);

    const thumb = await editor.get(ready.thumbnailUrl!);
    expect(thumb.headers['content-type']).toBe('image/webp');

    const usage = await editor.get(`/api/v1/orgs/${orgId}/media-usage`);
    expect(usage.json<{ usedBytes: number }>().usedBytes).toBe(ready.sizeBytes);
  }, 60_000);

  it.runIf(hasFfmpeg)(
    'processes videos (remux, metadata removed, duration)',
    async () => {
      await setup();
      const res = await editor.upload(mediaUrl(), 'promo.mp4', mp4({ seconds: 2 }), 'video/mp4');
      const ready = await waitFor(editor, res.json<{ media: MediaDto }>().media.id);
      expect(ready).toMatchObject({
        status: 'ready',
        kind: 'video',
        mime: 'video/mp4',
        width: 320,
        height: 240,
      });
      expect(ready.durationMs).toBeGreaterThan(1900);
    },
    60_000,
  );

  it('rejects disguised and forbidden file types before storing anything', async () => {
    await setup();
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    for (const [name, data, type] of [
      ['photo.png', exe, 'image/png'],
      ['logo.svg', svg, 'image/svg+xml'],
      ['notes.txt', Buffer.from(EICAR), 'text/plain'],
    ] as const) {
      const res = await editor.upload(mediaUrl(), name, data, type);
      expect(res.statusCode, name).toBe(415);
      expect(res.json()).toMatchObject({
        error: { fields: [{ path: 'file', reason: 'unsupported_type' }] },
      });
    }
    expect(await h.db.selectFrom('media').selectAll().execute()).toHaveLength(0);
  });

  it('blocks malware found by ClamAV and removes it', async () => {
    await setup();
    // Place an EICAR test file in quarantine as if it had been uploaded as an image.
    const id = randomUUID();
    const key = `${orgId}/${id}`;
    await h.storage!.put(
      h.storage!.config.quarantineBucket,
      key,
      Buffer.from(EICAR),
      'application/octet-stream',
    );
    await h.db
      .insertInto('media')
      .values({
        id,
        org_id: orgId,
        name: 'evil',
        original_filename: 'evil.png',
        kind: 'image',
        mime: 'image/png',
        status: 'queued',
        quarantine_key: key,
        size_bytes: EICAR.length,
      })
      .execute();
    await processMediaJob(
      {
        db: h.db,
        storage: h.storage!,
        clamav: { host: h.env.CLAMAV_HOST, port: h.env.CLAMAV_PORT },
        log: { info() {}, warn() {}, error() {} },
      },
      id,
    );
    const row = await h.db
      .selectFrom('media')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      status: 'blocked',
      failure_reason: 'malware_detected',
      quarantine_key: null,
    });
    await expect(h.storage!.get(h.storage!.config.quarantineBucket, key)).rejects.toThrow();
    const audit = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'meta'])
      .where('action', '=', 'media.blocked')
      .execute();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0]?.meta)).toContain('Eicar');
  }, 60_000);

  it('enforces size limits and the organization quota', async () => {
    await setup({ MEDIA_MAX_IMAGE_BYTES: '2048' });
    const big = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: '#000',
        noise: { type: 'gaussian', mean: 128, sigma: 50 },
      },
    })
      .png()
      .toBuffer();
    const tooBig = await editor.upload(mediaUrl(), 'big.png', big, 'image/png');
    expect(tooBig.statusCode).toBe(413);
    expect(await h.db.selectFrom('media').selectAll().execute()).toHaveLength(0);

    await h.close();
    await setup({ MEDIA_ORG_QUOTA_BYTES: String(big.length + 100) });
    expect((await editor.upload(mediaUrl(), 'one.png', big, 'image/png')).statusCode).toBe(202);
    const second = await editor.upload(mediaUrl(), 'two.png', big, 'image/png');
    expect(second.statusCode).toBe(403);
    expect(second.json()).toMatchObject({ error: { code: 'QUOTA_EXCEEDED' } });
  }, 60_000);

  it('checks the quota of uploads finishing together one by one (security review, D2)', async () => {
    let captured: AppContext | undefined;
    const image = await png();
    h = await createHarness(
      { MEDIA_ORG_QUOTA_BYTES: String(Math.round(image.length * 1.5)) },
      {
        media: true,
        extraRoutes: (_app, ctx) => {
          captured = ctx;
        },
      },
    );
    const userId = await insertUser(h.db, 'owner@example.com');
    orgId = await insertOrg(h.db, userId, 'Org', false);
    const ctx = captured!;
    // Four uploads that finish at the same moment: each write to storage waits for the others.
    const storage = ctx.media!.storage;
    const put = storage.put.bind(storage);
    let release: () => void = () => undefined;
    const allStored = new Promise<void>((resolve) => {
      release = resolve;
    });
    let stored = 0;
    storage.put = async (...args: Parameters<Storage['put']>) => {
      await put(...args);
      if (++stored === 4) release();
      await allStored;
    };
    const streams = Array.from({ length: 4 }, () => new PassThrough());
    const settled = Promise.allSettled(
      streams.map((stream, i) =>
        ingestMedia(ctx, ctx.media!, { orgId, userId, filename: `${String(i)}.png`, stream }),
      ),
    );
    for (const stream of streams) stream.end(image);
    const results = await settled;
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await h.db.selectFrom('media').select('id').execute()).toHaveLength(1);
  }, 60_000);

  it('isolates organizations and enforces roles', async () => {
    await setup();
    const res = await editor.upload(mediaUrl(), 'a.png', await png(), 'image/png');
    const id = res.json<{ media: MediaDto }>().media.id;
    await waitFor(editor, id);

    await insertOrg(h.db, await insertUser(h.db, 'outsider@example.com'), 'Other', false);
    const outsider = await login(h.app, 'outsider@example.com');
    for (const url of [
      mediaUrl(),
      `${mediaUrl()}/${id}`,
      `${mediaUrl()}/${id}/file`,
      `${mediaUrl()}/${id}/thumbnail`,
    ]) {
      expect((await outsider.get(url)).statusCode, url).toBe(404);
    }
    expect((await outsider.upload(mediaUrl(), 'x.png', await png(), 'image/png')).statusCode).toBe(
      404,
    );
    expect((await outsider.delete(`${mediaUrl()}/${id}`)).statusCode).toBe(404);

    const viewerId = await insertUser(h.db, 'viewer@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: viewerId, role: 'VIEWER' })
      .execute();
    const viewer = await login(h.app, 'viewer@example.com');
    expect((await viewer.get(mediaUrl())).json<{ media: unknown[] }>().media).toHaveLength(1);
    expect((await viewer.upload(mediaUrl(), 'x.png', await png(), 'image/png')).statusCode).toBe(
      403,
    );
    expect((await viewer.patch(`${mediaUrl()}/${id}`, { name: 'x' })).statusCode).toBe(403);
  }, 60_000);

  it('lists with search and pagination, renames and deletes everywhere', async () => {
    await setup();
    for (const name of ['תפריט בוקר', 'Menu_100%', 'Lobby']) {
      await editor.upload(mediaUrl(), `${name}.png`, await png(), 'image/png');
    }
    const search = await editor.get(`${mediaUrl()}?q=${encodeURIComponent('100%')}`);
    expect(search.json<{ media: { name: string }[] }>().media.map((m) => m.name)).toEqual([
      'Menu_100%',
    ]);
    const hebrew = await editor.get(`${mediaUrl()}?q=${encodeURIComponent('בוקר')}`);
    expect(hebrew.json<{ media: unknown[] }>().media).toHaveLength(1);

    const list = await editor.get(`${mediaUrl()}?kind=image`);
    const items = list.json<{ media: MediaDto[] }>().media;
    expect(items).toHaveLength(3);
    const target = await waitFor(editor, items[0]!.id);

    const renamed = await editor.patch(`${mediaUrl()}/${target.id}`, { name: 'Lobby screen' });
    expect(renamed.json()).toMatchObject({ media: { name: 'Lobby screen' } });

    expect((await editor.delete(`${mediaUrl()}/${target.id}`)).statusCode).toBe(204);
    expect((await editor.get(`${mediaUrl()}/${target.id}`)).statusCode).toBe(404);
    const deadline = Date.now() + 15_000;
    while (
      (await h.db
        .selectFrom('media')
        .select('id')
        .where('id', '=', target.id)
        .executeTakeFirst()) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(
      await h.db.selectFrom('media').select('id').where('id', '=', target.id).executeTakeFirst(),
    ).toBeUndefined();
    const actions = (await h.db.selectFrom('audit_logs').select('action').execute()).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['media.uploaded', 'media.renamed', 'media.deleted']),
    );
  }, 60_000);
});
