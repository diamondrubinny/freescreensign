import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseManifest, type ManifestV1 } from '@rubinny/shared';
import type { Db } from '../../src/db/database.js';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

async function insertMedia(
  db: Db,
  orgId: string,
  options: {
    kind?: 'image' | 'video';
    status?: 'ready' | 'processing';
    durationMs?: number;
    deleted?: boolean;
  } = {},
) {
  const kind = options.kind ?? 'image';
  const row = await db
    .insertInto('media')
    .values({
      org_id: orgId,
      name: `${kind}-${randomUUID().slice(0, 4)}`,
      original_filename: 'x',
      kind,
      mime: kind === 'image' ? 'image/png' : 'video/mp4',
      size_bytes: 1234,
      sha256: 'a'.repeat(64),
      width: 1920,
      height: 1080,
      duration_ms: options.durationMs ?? null,
      status: options.status ?? 'ready',
      storage_key: 'k',
      deleted_at: options.deleted ? new Date() : null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Collects JSON messages from a websocket. */
function collect(ws: WebSocket) {
  const messages: { type: string }[] = [];
  ws.on('message', (data: Buffer) =>
    messages.push(JSON.parse(data.toString()) as { type: string }),
  );
  return {
    messages,
    async next(type: string, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const index = messages.findIndex((m) => m.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`no "${type}" message; got ${JSON.stringify(messages)}`);
    },
  };
}

function closed(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.on('close', (code: number) => {
      resolve(code);
    });
  });
}

describe.runIf(integrationEnabled)('screens, pairing and the player API', () => {
  let h: Harness;
  let orgId: string;
  let admin: Client;
  let editor: Client;

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@example.com'), 'Org', false);
    const editorId = await insertUser(h.db, 'editor@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    admin = await login(h.app, 'admin@example.com');
    editor = await login(h.app, 'editor@example.com');
  });
  afterEach(() => h.close());

  const api = (path = '') => `/api/v1/orgs/${orgId}${path}`;

  async function pair(name = 'Lobby'): Promise<{ deviceToken: string; screenId: string }> {
    const player = new Client(h.app, '203.0.113.10');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const claim = await editor.post(api('/screens'), { code: start.code, name });
    expect(claim.statusCode).toBe(201);
    const status = await player.post('/player/v1/pair/status', { pollToken: start.pollToken });
    return status.json<{ deviceToken: string; screenId: string }>();
  }

  function playerGet(url: string, token: string, headers: Record<string, string> = {}) {
    return h.app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}`, ...headers },
    });
  }

  it('pairs a screen with a one-time code and delivers the token once', async () => {
    const player = new Client(h.app);
    const start = await player.post('/player/v1/pair/start');
    const { code, pollToken, expiresIn } = start.json<{
      code: string;
      pollToken: string;
      expiresIn: number;
    }>();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
    expect(expiresIn).toBe(600);
    expect((await player.post('/player/v1/pair/status', { pollToken })).json()).toEqual({
      status: 'pending',
    });

    const wrong = await editor.post(api('/screens'), { code: 'ZZZ-ZZZ', name: 'Lobby' });
    expect(wrong.json()).toMatchObject({
      error: { code: 'INVALID_TOKEN', fields: [{ path: 'code' }] },
    });

    // Users may type the code in lowercase, without the dash.
    const claim = await editor.post(api('/screens'), {
      code: code.replace('-', '').toLowerCase(),
      name: 'מסך כניסה',
    });
    expect(claim.statusCode).toBe(201);
    expect(claim.json()).toMatchObject({ screen: { name: 'מסך כניסה', online: false } });
    expect((await editor.post(api('/screens'), { code, name: 'Again' })).statusCode).toBe(400);

    const paired = await player.post('/player/v1/pair/status', { pollToken });
    const body = paired.json<{ status: string; deviceToken: string }>();
    expect(body.status).toBe('paired');
    expect(body.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The token is delivered exactly once.
    expect((await player.post('/player/v1/pair/status', { pollToken })).statusCode).toBe(404);
    // Only the hash is stored.
    const stored = await h.db.selectFrom('screens').select('token_hash').executeTakeFirstOrThrow();
    expect(stored.token_hash).not.toBe(body.deviceToken);
  });

  it('rejects expired pairing codes', async () => {
    const player = new Client(h.app);
    const { code, pollToken } = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    await h.db
      .updateTable('pairing_codes')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    expect((await editor.post(api('/screens'), { code, name: 'Lobby' })).statusCode).toBe(400);
    expect((await player.post('/player/v1/pair/status', { pollToken })).statusCode).toBe(404);
    expect(await h.db.selectFrom('screens').selectAll().execute()).toHaveLength(0);
  });

  it('rate-limits pairing starts per IP', async () => {
    const player = new Client(h.app, '198.51.100.99');
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await player.post('/player/v1/pair/start')).statusCode);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('serves a valid manifest with the playlist, ETag/304 and only ready media', async () => {
    const image = await insertMedia(h.db, orgId);
    const video = await insertMedia(h.db, orgId, { kind: 'video', durationMs: 15_000 });
    const overridden = await insertMedia(h.db, orgId);
    const playlist = (await editor.post(api('/playlists'), { name: 'Morning' })).json<{
      playlist: { id: string };
    }>().playlist;
    const put = await editor.put(api(`/playlists/${playlist.id}/items`), {
      items: [
        { mediaId: image, durationMs: null },
        { mediaId: video, durationMs: null },
        { mediaId: overridden, durationMs: 5000 },
      ],
    });
    expect(put.statusCode).toBe(200);

    const { deviceToken, screenId } = await pair();
    await editor.patch(api(`/screens/${screenId}`), {
      playlistId: playlist.id,
      orientation: 'portrait',
    });

    const res = await playerGet('/player/v1/manifest', deviceToken);
    expect(res.statusCode).toBe(200);
    const parsed = parseManifest(res.json());
    expect(parsed.success).toBe(true);
    const manifest = res.json<ManifestV1>();
    expect(manifest.screen).toMatchObject({ id: screenId, orientation: 'portrait' });
    expect(manifest.layouts[0]).toMatchObject({ width: 1080, height: 1920 });
    expect(manifest.playlists[0]!.items.map((i) => [i.ref, i.durationMs])).toEqual([
      [image, 10_000],
      [video, 15_000],
      [overridden, 5000],
    ]);

    const etag = res.headers.etag as string;
    expect(
      (await playerGet('/player/v1/manifest', deviceToken, { 'if-none-match': etag })).statusCode,
    ).toBe(304);

    // Deleting media changes the manifest (and its version).
    await h.db
      .updateTable('media')
      .set({ deleted_at: new Date() })
      .where('id', '=', video)
      .execute();
    const after = await playerGet('/player/v1/manifest', deviceToken, { 'if-none-match': etag });
    expect(after.statusCode).toBe(200);
    expect(after.json<ManifestV1>().media.map((m) => m.id)).toEqual([image, overridden]);
  });

  it('only accepts ready media of the same organization in playlists', async () => {
    const otherOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'other@example.com'),
      'Other',
      false,
    );
    const foreign = await insertMedia(h.db, otherOrg);
    const processing = await insertMedia(h.db, orgId, { status: 'processing' });
    const playlist = (await editor.post(api('/playlists'), { name: 'P' })).json<{
      playlist: { id: string };
    }>().playlist;
    const res = await editor.put(api(`/playlists/${playlist.id}/items`), {
      items: [
        { mediaId: foreign, durationMs: null },
        { mediaId: processing, durationMs: null },
      ],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { fields: [{ path: 'items.0.mediaId' }, { path: 'items.1.mediaId' }] },
    });
  });

  it('authenticates players and revokes removed screens', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/player/v1/manifest' })).statusCode).toBe(
      401,
    );
    expect((await playerGet('/player/v1/manifest', 'x'.repeat(43))).statusCode).toBe(401);
    const { deviceToken, screenId } = await pair();
    expect((await playerGet('/player/v1/manifest', deviceToken)).statusCode).toBe(200);

    // Removing a screen requires ADMIN.
    expect((await editor.delete(api(`/screens/${screenId}`))).statusCode).toBe(403);
    expect((await admin.delete(api(`/screens/${screenId}`))).statusCode).toBe(204);
    expect((await playerGet('/player/v1/manifest', deviceToken)).statusCode).toBe(401);
  });

  it('records heartbeats and reports online status', async () => {
    const { deviceToken } = await pair();
    const hb = await h.app.inject({
      method: 'POST',
      url: '/player/v1/heartbeat',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { manifestVersion: 'abc', playerVersion: '0.1.0', resolution: '1920x1080' },
    });
    expect(hb.statusCode).toBe(200);
    expect(hb.json<{ serverTime: string }>().serverTime).toMatch(/^\d{4}-/);
    const list = (await editor.get(api('/screens'))).json<{
      screens: { online: boolean; resolution: string; playerVersion: string }[];
    }>();
    expect(list.screens[0]).toMatchObject({
      online: true,
      resolution: '1920x1080',
      playerVersion: '0.1.0',
    });
  });

  it('pushes manifest changes, reloads and revocation over WebSocket', async () => {
    const image = await insertMedia(h.db, orgId);
    const playlist = (await editor.post(api('/playlists'), { name: 'P' })).json<{
      playlist: { id: string };
    }>().playlist;
    const { deviceToken, screenId } = await pair();
    await editor.patch(api(`/screens/${screenId}`), { playlistId: playlist.id });

    await h.app.ready();
    const ws = await h.app.injectWS('/player/v1/ws');
    const inbox = collect(ws);
    ws.send(JSON.stringify({ type: 'auth', token: deviceToken }));
    expect(await inbox.next('hello')).toMatchObject({ screenId });

    await editor.put(api(`/playlists/${playlist.id}/items`), {
      items: [{ mediaId: image, durationMs: null }],
    });
    await inbox.next('manifest.changed');

    expect((await editor.post(api(`/screens/${screenId}/reload`))).statusCode).toBe(202);
    await inbox.next('reload');

    const closing = closed(ws);
    await admin.delete(api(`/screens/${screenId}`));
    await inbox.next('revoked');
    expect(await closing).toBe(4401);
  });

  it('closes unauthenticated websockets', async () => {
    await h.app.ready();
    const ws = await h.app.injectWS('/player/v1/ws');
    const closing = closed(ws);
    ws.send(JSON.stringify({ type: 'auth', token: 'nope' }));
    expect(await closing).toBe(4401);
  });

  it('isolates screens and playlists between organizations', async () => {
    const { screenId } = await pair();
    const playlist = (await editor.post(api('/playlists'), { name: 'Mine' })).json<{
      playlist: { id: string };
    }>().playlist;
    const otherOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'outsider@example.com'),
      'Other',
      false,
    );
    const outsider = await login(h.app, 'outsider@example.com');
    for (const url of [api('/screens'), api('/playlists'), api(`/playlists/${playlist.id}`)]) {
      expect((await outsider.get(url)).statusCode, url).toBe(404);
    }
    expect((await outsider.patch(api(`/screens/${screenId}`), { name: 'x' })).statusCode).toBe(404);
    // A playlist from another organization cannot be assigned.
    const theirs = (
      await outsider.post(`/api/v1/orgs/${otherOrg}/playlists`, { name: 'Theirs' })
    ).json<{ playlist: { id: string } }>().playlist;
    const assign = await editor.patch(api(`/screens/${screenId}`), { playlistId: theirs.id });
    expect(assign.json()).toMatchObject({ error: { fields: [{ path: 'playlistId' }] } });

    const viewerId = await insertUser(h.db, 'viewer@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: viewerId, role: 'VIEWER' })
      .execute();
    const viewer = await login(h.app, 'viewer@example.com');
    expect((await viewer.get(api('/screens'))).statusCode).toBe(200);
    expect((await viewer.post(api('/screens'), { code: 'ABC-DEF', name: 'x' })).statusCode).toBe(
      403,
    );
    expect((await viewer.post(api('/playlists'), { name: 'x' })).statusCode).toBe(403);
  });
});
