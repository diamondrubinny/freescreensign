import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { alertActive, pickAlert, type ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

describe('alert selection', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 10, minute));
  it('prefers the newest emergency over any notice', () => {
    expect(pickAlert([])).toBeNull();
    const picked = pickAlert([
      { id: 'n1', style: 'notice' as const, startsAt: at(5) },
      { id: 'e1', style: 'emergency' as const, startsAt: at(1) },
      { id: 'e2', style: 'emergency' as const, startsAt: at(2) },
      { id: 'n2', style: 'notice' as const, startsAt: at(9) },
    ]);
    expect(picked?.id).toBe('e2');
    expect(
      pickAlert([
        { id: 'n1', style: 'notice' as const, startsAt: at(1) },
        { id: 'n2', style: 'notice' as const, startsAt: at(3) },
      ])?.id,
    ).toBe('n2');
  });

  it('expires on the screen by itself', () => {
    const alert = {
      id: 'a',
      style: 'notice' as const,
      title: 'x',
      message: '',
      endsAt: at(10).toISOString(),
    };
    expect(alertActive(alert, at(9))).toBe(true);
    expect(alertActive(alert, at(10))).toBe(false);
    expect(alertActive({ ...alert, endsAt: null }, at(59))).toBe(true);
    expect(alertActive(null, at(0))).toBe(false);
  });
});

describe.runIf(integrationEnabled)('emergency alerts', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let editor: Client;
  let viewer: Client;
  let outsider: Client;

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'owner@example.com'), 'School', false);
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

  async function pair(client: Client, org: string, name: string) {
    const player = new Client(h.app, '203.0.113.30');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const created = await client.post(api('/screens', org), { code: start.code, name });
    expect(created.statusCode, created.body).toBe(201);
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();
    return { id: created.json<{ screen: { id: string } }>().screen.id, token: deviceToken };
  }

  const manifest = async (token: string) =>
    (
      await h.app.inject({
        method: 'GET',
        url: '/player/v1/manifest',
        headers: { authorization: `Bearer ${token}` },
      })
    ).json<ManifestV1>();

  it('puts an alert on the chosen screens at once, and takes it off when ended', async () => {
    const hall = await pair(editor, orgId, 'Hall');
    const gym = await pair(editor, orgId, 'Gym');
    const events: string[] = [];
    h.events.onEvent((screenId, event) => {
      events.push(`${screenId === hall.id ? 'hall' : 'gym'}:${event.type}`);
    });
    expect((await manifest(hall.token)).alert).toBeNull();

    // Viewers cannot start alerts.
    expect((await viewer.post(api('/alerts'), { style: 'emergency', title: 'x' })).statusCode).toBe(
      403,
    );

    const started = await editor.post(api('/alerts'), {
      style: 'emergency',
      title: 'פינוי מיידי',
      message: 'צאו מהבניין ליציאה הקרובה',
      screenIds: [hall.id],
    });
    expect(started.statusCode, started.body).toBe(201);
    const { alert, screens } = started.json<{
      alert: { id: string; active: boolean };
      screens: number;
    }>();
    expect(screens).toBe(1);
    expect(alert.active).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toContain('hall:manifest.changed');
    expect(events).not.toContain('gym:manifest.changed');

    expect((await manifest(hall.token)).alert).toMatchObject({
      id: alert.id,
      style: 'emergency',
      title: 'פינוי מיידי',
      endsAt: null,
    });
    expect((await manifest(gym.token)).alert).toBeNull();

    // An organization-wide notice reaches both; the emergency still wins on the hall screen.
    await editor.post(api('/alerts'), {
      style: 'notice',
      title: 'Main gate closed',
      durationMinutes: 30,
    });
    expect((await manifest(hall.token)).alert?.id).toBe(alert.id);
    const gymAlert = (await manifest(gym.token)).alert;
    expect(gymAlert).toMatchObject({ style: 'notice', title: 'Main gate closed' });
    expect(Date.parse(gymAlert!.endsAt!) - Date.now()).toBeGreaterThan(29 * 60_000);

    const list = (await viewer.get(api('/alerts'))).json<{
      active: { id: string; createdBy: string | null }[];
      recent: unknown[];
    }>();
    expect(list.active).toHaveLength(2);
    expect(list.recent).toHaveLength(2);

    // Ending: the screen goes back to its content; ending twice is a conflict.
    const ended = await editor.post(api(`/alerts/${alert.id}/end`));
    expect(ended.statusCode, ended.body).toBe(200);
    expect(ended.json()).toMatchObject({ alert: { active: false } });
    expect((await manifest(hall.token)).alert?.style).toBe('notice');
    expect((await editor.post(api(`/alerts/${alert.id}/end`))).statusCode).toBe(409);

    const audit = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('org_id', '=', orgId)
      .where('action', 'like', 'alert.%')
      .execute();
    expect(audit.map((row) => row.action).sort()).toEqual([
      'alert.ended',
      'alert.started',
      'alert.started',
    ]);
  });

  it('expired alerts leave the manifest', async () => {
    const hall = await pair(editor, orgId, 'Hall');
    const started = await editor.post(api('/alerts'), {
      style: 'notice',
      title: 'Short',
      durationMinutes: 1,
    });
    const { alert } = started.json<{ alert: { id: string } }>();
    expect((await manifest(hall.token)).alert?.id).toBe(alert.id);
    await h.db
      .updateTable('alerts')
      .set({ starts_at: new Date(Date.now() - 120_000), ends_at: new Date(Date.now() - 60_000) })
      .where('id', '=', alert.id)
      .execute();
    expect((await manifest(hall.token)).alert).toBeNull();
    expect((await viewer.get(api('/alerts'))).json()).toMatchObject({ active: [] });
  });

  it('never reaches another organization, and validates its input', async () => {
    const theirs = await pair(outsider, otherOrgId, 'Theirs');
    // Screens of another organization are refused, not silently skipped.
    const foreign = await editor.post(api('/alerts'), {
      style: 'emergency',
      title: 'x',
      screenIds: [theirs.id],
    });
    expect(foreign.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: [{ path: 'screenIds' }] },
    });
    await editor.post(api('/alerts'), { style: 'emergency', title: 'Ours only' });
    expect((await manifest(theirs.token)).alert).toBeNull();

    for (const body of [
      { style: 'panic', title: 'x' },
      { style: 'notice', title: '' },
      { style: 'notice', title: 'x'.repeat(121) },
      { style: 'notice', title: 'x', durationMinutes: 0 },
      { style: 'notice', title: 'x', screenIds: [] },
    ]) {
      expect((await editor.post(api('/alerts'), body)).statusCode).toBe(400);
    }
  });

  it('caps the number of active alerts', async () => {
    await h.db
      .insertInto('alerts')
      .values(
        Array.from({ length: 20 }, (_, i) => ({
          org_id: orgId,
          style: 'notice' as const,
          title: `Notice ${String(i)}`,
        })),
      )
      .execute();
    const res = await editor.post(api('/alerts'), { style: 'emergency', title: 'One more' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'QUOTA_EXCEEDED' } });
  });
});
