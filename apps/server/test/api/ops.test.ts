import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../../src/db/database.js';
import { runMaintenance } from '../../src/lib/maintenance.js';
import { reportScreenBack, runOfflineAlerts } from '../../src/modules/ops/alerts.js';
import { recordUptime, uptimeSummary } from '../../src/modules/ops/uptime.js';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

async function insertMedia(db: Db, orgId: string, name: string) {
  const row = await db
    .insertInto('media')
    .values({
      org_id: orgId,
      name,
      original_filename: 'x.png',
      kind: 'image',
      mime: 'image/png',
      size_bytes: 1234,
      sha256: 'a'.repeat(64),
      width: 1920,
      height: 1080,
      status: 'ready',
      storage_key: 'k',
      thumbnail_key: 't',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

describe.runIf(integrationEnabled)('operations: screen status and uptime', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;
  let viewer: Client;
  let outsider: Client;

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
  });
  afterEach(() => h.close());

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

  it('reports what a screen shows, its clock and uptime', async () => {
    const image = await insertMedia(h.db, orgId, 'Open day');
    const foreign = await insertMedia(h.db, otherOrgId, 'Not yours');
    const clock = (
      await editor.post(api('/widgets'), { type: 'clock', name: 'Lobby clock', config: {} })
    ).json<{ widget: { id: string } }>().widget.id;
    const playlist = (await editor.post(api('/playlists'), { name: 'Promo' })).json<{
      playlist: { id: string };
    }>().playlist.id;
    const { deviceToken, screenId } = await pair();

    const hb = await heartbeat(deviceToken, {
      manifestVersion: 'v1',
      clockOffsetMs: 125_000,
      layoutId: `playlist-${playlist}`,
      nowPlaying: [
        { zoneId: 'main', kind: 'media', ref: image },
        { zoneId: 'side', kind: 'widget', ref: clock },
        { zoneId: 'x', kind: 'media', ref: foreign },
      ],
    });
    expect(hb.statusCode, hb.body).toBe(200);

    const res = await viewer.get(api(`/screens/${screenId}/status`));
    expect(res.statusCode).toBe(200);
    const { status } = res.json<{
      status: {
        online: boolean;
        clockOffsetMs: number;
        clockOk: boolean;
        uptime: { day: number | null; week: number | null; hours: (number | null)[] };
        layout: { kind: string; name: string | null };
        nowPlaying: Record<string, unknown>[];
      };
    }>();
    expect(status).toMatchObject({
      online: true,
      clockOffsetMs: 125_000,
      clockOk: false,
      layout: { kind: 'playlist', name: 'Promo' },
    });
    // Another organization's content is never resolved, even if a player reports it.
    expect(status.nowPlaying).toEqual([
      {
        zoneId: 'main',
        kind: 'media',
        id: image,
        name: 'Open day',
        mediaKind: 'image',
        thumbnailUrl: `/api/v1/orgs/${orgId}/media/${image}/thumbnail`,
      },
      { zoneId: 'side', kind: 'widget', id: clock, name: 'Lobby clock', widgetType: 'clock' },
    ]);
    expect(status.uptime.hours).toHaveLength(24);

    const screens = (await viewer.get(api('/screens'))).json<{
      screens: { clockOffsetMs: number }[];
    }>().screens;
    expect(screens[0]?.clockOffsetMs).toBe(125_000);
  });

  it('validates heartbeats and isolates status between organizations', async () => {
    const { deviceToken, screenId } = await pair();
    for (const bad of [
      { clockOffsetMs: 1.5 },
      { nowPlaying: [{ zoneId: 'z', kind: 'html', ref: randomUUID() }] },
      {
        nowPlaying: Array.from({ length: 33 }, () => ({
          zoneId: 'z',
          kind: 'media',
          ref: randomUUID(),
        })),
      },
      { layoutId: 'x'.repeat(65) },
    ]) {
      expect((await heartbeat(deviceToken, bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await outsider.get(api(`/screens/${screenId}/status`))).statusCode).toBe(404);
    expect((await outsider.get(api(`/screens/${screenId}/status`, otherOrgId))).statusCode).toBe(
      404,
    );
  });

  it('computes uptime from 5-minute slots, only since the screen existed', async () => {
    const { screenId } = await pair();
    const day = Date.parse('2026-10-15T00:00:00Z');
    const created = new Date(day - 60 * 60 * 1000); // one hour before the window
    await h.db
      .updateTable('screens')
      .set({ created_at: created })
      .where('id', '=', screenId)
      .execute();
    // Online 10:00–12:00 (24 slots), heartbeats every 30 s set the same slot repeatedly.
    for (let t = day + 10 * 3_600_000; t < day + 12 * 3_600_000; t += 30_000) {
      await recordUptime(h.db, screenId, new Date(t));
    }
    const screen = { id: screenId, created_at: created };
    const summary = await uptimeSummary(
      h.db,
      screen,
      new Date(day),
      new Date(day + 24 * 3_600_000),
    );
    expect(summary.ratio).toBeCloseTo(24 / 288);
    expect(summary.hours).toHaveLength(24);
    expect(summary.hours[10]).toBe(1);
    expect(summary.hours[9]).toBe(0);

    // A screen created at 11:00 counts only from then: 12 of 12 slots before noon.
    const young = { id: screenId, created_at: new Date(day + 11 * 3_600_000) };
    const partial = await uptimeSummary(h.db, young, new Date(day), new Date(day + 12 * 3_600_000));
    expect(partial.ratio).toBe(1);
    expect(partial.hours.slice(0, 11).every((hour) => hour === null)).toBe(true);

    // Midnight crossing: slots of two UTC days.
    await recordUptime(h.db, screenId, new Date(day + 24 * 3_600_000 + 60_000));
    const late = await uptimeSummary(
      h.db,
      screen,
      new Date(day + 23 * 3_600_000),
      new Date(day + 24 * 3_600_000 + 10 * 60_000),
    );
    expect(late.ratio).toBeCloseTo(1 / 14);

    // Retention: history older than 90 days is removed by maintenance.
    await recordUptime(h.db, screenId, new Date(Date.now() - 91 * 24 * 3_600_000));
    await recordUptime(h.db, screenId, new Date(Date.now() - 89 * 24 * 3_600_000));
    const before = await h.db.selectFrom('screen_uptime_days').select('day').execute();
    const { uptimeDays } = await runMaintenance(h.db, 365);
    expect(uptimeDays).toBe(1);
    expect(await h.db.selectFrom('screen_uptime_days').select('day').execute()).toHaveLength(
      before.length - 1,
    );
  });

  describe('offline alerts', () => {
    const HOUR = 3_600_000;
    const deps = () => ({ db: h.db, mailer: h.mailer, publicUrl: 'https://signage.example.com' });
    const longAgo = () => new Date(Date.now() - HOUR);
    const offlineFor = (screenId: string, minutes: number) =>
      h.db
        .updateTable('screens')
        .set({ last_seen_at: new Date(Date.now() - minutes * 60_000) })
        .where('id', '=', screenId)
        .execute();

    async function setup() {
      // A second admin without a verified address gets nothing.
      const unverified = await insertUser(h.db, 'unverified@example.com', { verified: false });
      await h.db
        .insertInto('memberships')
        .values({ org_id: orgId, user_id: unverified, role: 'ADMIN' })
        .execute();
      await h.db
        .updateTable('organizations')
        .set({ offline_alerts: true, offline_alert_minutes: 10 })
        .where('id', '=', orgId)
        .execute();
      return pair();
    }

    it('e-mails owners and admins once per outage, and again when the screen is back', async () => {
      const { deviceToken, screenId } = await setup();
      await h.db.updateTable('screens').set({ name: 'Lobby\nBcc: x@evil.test' }).execute();
      await offlineFor(screenId, 11);
      h.mailer.sent.length = 0;

      expect(await runOfflineAlerts(deps(), longAgo())).toEqual({ orgs: 1, screens: 1 });
      expect(h.mailer.sent.map((m) => m.to)).toEqual(['owner@example.com']);
      const mail = h.mailer.sent[0]!;
      // A screen name can never add header lines to the subject.
      expect(mail.subject).toBe('המסך "Lobby Bcc: x@evil.test" לא מחובר');
      expect(mail.text).toContain('יותר מ-10 דקות');
      expect(mail.text).toContain(`https://signage.example.com/orgs/${orgId}/screens`);

      // Once per outage.
      expect(await runOfflineAlerts(deps(), longAgo())).toEqual({ orgs: 0, screens: 0 });
      expect(h.mailer.sent).toHaveLength(1);

      // The next heartbeat reports the screen back (once).
      expect((await heartbeat(deviceToken, {})).statusCode).toBe(200);
      await vi.waitFor(() => {
        expect(h.mailer.sent).toHaveLength(2);
      });
      expect(h.mailer.sent[1]?.subject).toContain('חזר לפעול');
      expect(await reportScreenBack(deps(), screenId)).toBe(false);
      expect(await runOfflineAlerts(deps(), longAgo())).toEqual({ orgs: 0, screens: 0 });
    });

    it('groups screens, respects the delay, startup grace and the organization setting', async () => {
      const first = await setup();
      const second = await pair();
      const never = await pair();
      await h.db
        .updateTable('screens')
        .set({ last_seen_at: null })
        .where('id', '=', never.screenId)
        .execute();
      await offlineFor(first.screenId, 30);
      await offlineFor(second.screenId, 9); // not yet past the 10-minute delay
      h.mailer.sent.length = 0;

      // Right after the server starts, screens get time to reconnect first.
      expect(await runOfflineAlerts(deps(), new Date())).toEqual({ orgs: 0, screens: 0 });

      expect(await runOfflineAlerts(deps(), longAgo())).toEqual({ orgs: 1, screens: 1 });
      await offlineFor(second.screenId, 12);
      await h.db.updateTable('screens').set({ offline_alerted_at: null }).execute();
      h.mailer.sent.length = 0;
      expect(await runOfflineAlerts(deps(), longAgo())).toEqual({ orgs: 1, screens: 2 });
      // One message listing both (a screen that never connected is not reported).
      expect(h.mailer.sent).toHaveLength(1);
      expect(h.mailer.sent[0]?.subject).toBe('2 מסכים לא מחוברים ב-Org');

      await h.db.updateTable('screens').set({ offline_alerted_at: null }).execute();
      await h.db.updateTable('organizations').set({ offline_alerts: false }).execute();
      expect(await runOfflineAlerts(deps(), longAgo())).toEqual({ orgs: 0, screens: 0 });
    });

    it('lets only admins change the alert settings, within limits', async () => {
      const owner = await login(h.app, 'owner@example.com');
      const res = await owner.patch(api(), { offlineAlerts: true, offlineAlertMinutes: 15 });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ org: { offlineAlerts: true, offlineAlertMinutes: 15 } });
      expect((await owner.get(api())).json()).toMatchObject({
        org: { offlineAlerts: true, offlineAlertMinutes: 15 },
      });
      expect((await owner.patch(api(), { offlineAlertMinutes: 4 })).statusCode).toBe(400);
      expect((await owner.patch(api(), { offlineAlertMinutes: 1441 })).statusCode).toBe(400);
      expect((await editor.patch(api(), { offlineAlerts: false })).statusCode).toBe(403);
    });
  });
});
