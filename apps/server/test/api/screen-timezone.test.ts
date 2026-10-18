import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ManifestV1 } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

describe.runIf(integrationEnabled)('a screen’s time zone', () => {
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

  it('is set by the editor, stored canonically and used by the screen', async () => {
    const player = new Client(h.app, '203.0.113.70');
    const start = (await player.post('/player/v1/pair/start')).json<{
      code: string;
      pollToken: string;
    }>();
    const created = await admin.post(api('/screens'), { code: start.code, name: 'London' });
    const id = created.json<{ screen: { id: string; timezone: string } }>().screen.id;
    expect(created.json()).toMatchObject({ screen: { timezone: 'Asia/Jerusalem' } });
    const { deviceToken } = (
      await player.post('/player/v1/pair/status', { pollToken: start.pollToken })
    ).json<{ deviceToken: string }>();

    const events: string[] = [];
    h.events.onEvent((screenId, event) => {
      events.push(`${screenId}:${event.type}`);
    });
    const res = await admin.patch(api(`/screens/${id}`), { timezone: ' europe/london ' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ screen: { timezone: 'Europe/London' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toContain(`${id}:manifest.changed`);
    const manifest = await h.app.inject({
      url: '/player/v1/manifest',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(manifest.json<ManifestV1>().screen.timezone).toBe('Europe/London');

    for (const timezone of ['Mars/Olympus', '', 'x'.repeat(65)]) {
      const bad = await admin.patch(api(`/screens/${id}`), { timezone });
      expect(bad.statusCode, timezone).toBe(400);
      expect(bad.json()).toMatchObject({ error: { fields: [{ path: 'timezone' }] } });
    }
  });
});
