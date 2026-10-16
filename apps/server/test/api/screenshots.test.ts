import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMaintenance } from '../../src/lib/maintenance.js';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

/** A real JPEG with EXIF (incl. GPS-like comment) that must not survive re-encoding. */
async function jpegWithExif(width = 2400, height = 1350): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#336699' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-device-serial', Make: 'TestCam' } })
    .toBuffer();
}

describe.runIf(integrationEnabled)('remote screenshots', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;
  let viewer: Client;
  let outsider: Client;
  let published: { screenId: string; event: { type: string; requestId?: string } }[];

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'owner@example.com'), 'Org', false);
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
    const original = h.events.publish.bind(h.events);
    vi.spyOn(h.events, 'publish').mockImplementation((screenId, event) => {
      published.push({ screenId, event });
      return original(screenId, event);
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await h.close();
  });

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;

  async function pair(): Promise<{ deviceToken: string; screenId: string }> {
    const player = new Client(h.app, '203.0.113.10');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    expect(
      (await editor.post(api('/screens'), { code: start.code, name: 'Lobby' })).statusCode,
    ).toBe(201);
    return (await player.post('/player/v1/pair/status', { pollToken: start.pollToken })).json();
  }

  const heartbeat = (token: string, payload: Record<string, unknown>) =>
    h.app.inject({
      method: 'POST',
      url: '/player/v1/heartbeat',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  const upload = (token: string, requestId: string, body: Buffer, type = 'image/jpeg') =>
    h.app.inject({
      method: 'POST',
      url: `/player/v1/screenshot?requestId=${requestId}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': type },
      payload: body,
    });

  it('requests, receives and serves a re-encoded screenshot', async () => {
    const { deviceToken, screenId } = await pair();
    // A browser without a wrapper cannot take screenshots.
    expect((await editor.post(api(`/screens/${screenId}/screenshot`))).statusCode).toBe(409);

    await heartbeat(deviceToken, { platform: 'electron', capabilities: ['screenshot'] });
    // Viewers cannot request; editors can.
    expect((await viewer.post(api(`/screens/${screenId}/screenshot`))).statusCode).toBe(403);
    const requested = await editor.post(api(`/screens/${screenId}/screenshot`));
    expect(requested.statusCode).toBe(202);
    const { requestId } = requested.json<{ requestId: string }>();
    expect(published).toContainEqual({ screenId, event: { type: 'screenshot', requestId } });

    const status = (await viewer.get(api(`/screens/${screenId}/status`))).json<{
      status: Record<string, unknown>;
    }>().status;
    expect(status).toMatchObject({
      platform: 'electron',
      capabilities: ['screenshot'],
      screenshot: null,
      screenshotPending: true,
    });

    const res = await upload(deviceToken, requestId, await jpegWithExif());
    expect(res.statusCode, res.body).toBe(204);
    // A request is answered once.
    expect((await upload(deviceToken, requestId, await jpegWithExif())).statusCode).toBe(409);

    const image = await viewer.get(api(`/screens/${screenId}/screenshot`));
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toBe('private, no-store');
    const meta = await sharp(image.rawPayload).metadata();
    // Scaled into the 1920 box, metadata stripped.
    expect([meta.width, meta.height]).toEqual([1920, 1080]);
    expect(meta.exif).toBeUndefined();
    expect(image.rawPayload.includes(Buffer.from('secret-device-serial'))).toBe(false);

    const after = (await viewer.get(api(`/screens/${screenId}/status`))).json<{
      status: { screenshot: { width: number }; screenshotPending: boolean };
    }>().status;
    expect(after.screenshot.width).toBe(1920);
    expect(after.screenshotPending).toBe(false);

    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('action', '=', 'screen.screenshot_requested')
      .execute();
    expect(audit).toHaveLength(1);
  });

  it('rejects wrong requests, other screens, non-images and oversized uploads', async () => {
    const first = await pair();
    const second = await pair();
    await heartbeat(first.deviceToken, { platform: 'android', capabilities: ['screenshot'] });
    const { requestId } = (await editor.post(api(`/screens/${first.screenId}/screenshot`))).json<{
      requestId: string;
    }>();
    const jpeg = await jpegWithExif(640, 360);

    // Another screen cannot answer it, nor can an unknown id.
    expect((await upload(second.deviceToken, requestId, jpeg)).statusCode).toBe(409);
    expect(
      (await upload(first.deviceToken, '00000000-0000-4000-8000-000000000000', jpeg)).statusCode,
    ).toBe(409);
    // The bytes decide, not the declared type.
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect((await upload(first.deviceToken, requestId, html)).statusCode).toBe(415);
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), html]);
    expect((await upload(first.deviceToken, requestId, fakePng, 'image/png')).statusCode).toBe(415);
    expect((await upload(first.deviceToken, requestId, jpeg, 'text/plain')).statusCode).toBe(415);
    const huge = Buffer.concat([jpeg, Buffer.alloc(4 * 1024 * 1024)]);
    expect((await upload(first.deviceToken, requestId, huge)).statusCode).toBe(413);
    expect((await upload('bad-token', requestId, jpeg)).statusCode).toBe(401);

    // Expired after two minutes.
    await h.db
      .updateTable('screens')
      .set({ screenshot_requested_at: new Date(Date.now() - 3 * 60_000) })
      .where('id', '=', first.screenId)
      .execute();
    expect((await upload(first.deviceToken, requestId, jpeg)).statusCode).toBe(409);

    // Organizations are isolated.
    expect((await outsider.get(api(`/screens/${first.screenId}/screenshot`))).statusCode).toBe(404);
    expect(
      (await outsider.post(api(`/screens/${first.screenId}/screenshot`, otherOrgId))).statusCode,
    ).toBe(404);
  });

  it('rate-limits requests per screen and removes old screenshots', async () => {
    const { deviceToken, screenId } = await pair();
    await heartbeat(deviceToken, { platform: 'electron', capabilities: ['screenshot'] });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await editor.post(api(`/screens/${screenId}/screenshot`))).statusCode);
    }
    expect(codes.slice(0, 6).every((code) => code === 202)).toBe(true);
    expect(codes[6]).toBe(429);

    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#000' },
    })
      .jpeg()
      .toBuffer();
    await h.db
      .insertInto('screen_screenshots')
      .values({
        screen_id: screenId,
        image,
        width: 8,
        height: 8,
        taken_at: new Date(Date.now() - 8 * 24 * 3_600_000),
      })
      .execute();
    expect((await runMaintenance(h.db, 365)).screenshots).toBe(1);
    expect((await viewer.get(api(`/screens/${screenId}/screenshot`))).statusCode).toBe(404);
  });

  it('delivers the request to the player over its WebSocket (through Redis)', async () => {
    const { deviceToken, screenId } = await pair();
    await heartbeat(deviceToken, { platform: 'electron', capabilities: ['screenshot'] });
    await h.app.ready();
    const ws = await h.app.injectWS('/player/v1/ws');
    const messages: { type: string; requestId?: string }[] = [];
    ws.on('message', (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as { type: string });
    });
    ws.send(JSON.stringify({ type: 'auth', token: deviceToken }));
    await vi.waitFor(() => {
      expect(messages.map((m) => m.type)).toContain('hello');
    });
    const { requestId } = (await editor.post(api(`/screens/${screenId}/screenshot`))).json<{
      requestId: string;
    }>();
    await vi.waitFor(() => {
      expect(messages).toContainEqual({ type: 'screenshot', requestId });
    });
    ws.terminate();
  });
});
