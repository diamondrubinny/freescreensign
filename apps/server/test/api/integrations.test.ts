// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KeyRing } from '../../src/lib/crypto.js';
import { runMaintenance } from '../../src/lib/maintenance.js';
import { reportExpiredAlerts } from '../../src/modules/alerts/service.js';
import {
  DISABLE_AFTER_FAILURES,
  DISABLE_AFTER_HOURS,
  runWebhookDeliveries,
  secretAad,
  signPayload,
} from '../../src/modules/integrations/delivery.js';
import { shortenIp } from '../../src/modules/integrations/keys.js';
import { reportScreenBack, runOfflineAlerts } from '../../src/modules/ops/alerts.js';
import {
  type Client,
  PUBLIC_URL,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Received {
  headers: IncomingHttpHeaders;
  body: string;
}

describe('integration helpers', () => {
  it('shortens addresses kept with "last used"', () => {
    expect(shortenIp('203.0.113.77')).toBe('203.0.113.0/24');
    expect(shortenIp('::ffff:198.51.100.9')).toBe('198.51.100.0/24');
    expect(shortenIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48');
    // Compressed addresses are expanded first.
    expect(shortenIp('2001:db8::1')).toBe('2001:db8:0::/48');
    expect(shortenIp('::1')).toBe('0:0:0::/48');
    expect(shortenIp('not an address')).toBe('unknown');
  });

  it('signs "<timestamp>.<body>" with HMAC-SHA256', () => {
    const body = '{"a":1}';
    const expected = createHmac('sha256', 'whsec_x').update(`1700000000.${body}`).digest('hex');
    expect(signPayload('whsec_x', body, 1700000000)).toBe(`t=1700000000,v1=${expected}`);
  });
});

describe.runIf(integrationEnabled)('integrations: API keys and webhooks', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  let admin: Client;
  let editor: Client;
  let outsider: Client;
  let keys: KeyRing;

  // A receiver for webhooks (plain http on localhost: allowed by WIDGET_FETCH_ALLOW_PRIVATE).
  let receiver: Server;
  let receiverUrl: string;
  let received: Received[] = [];
  let answer = 200;

  beforeAll(async () => {
    receiver = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({ headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
        response.writeHead(answer).end('ok');
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverUrl = `http://127.0.0.1:${String((receiver.address() as AddressInfo).port)}/hook`;
  });
  afterAll(
    () =>
      new Promise<void>((resolve) => {
        receiver.close(() => {
          resolve();
        });
      }),
  );

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;
  const integration = (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    token: string,
    body?: object,
  ) =>
    h.app.inject({
      method,
      url: `/api/integrations/v1${path}`,
      headers: { authorization: `Bearer ${token}` },
      ...(body ? { payload: body } : {}),
    });

  async function createKey(scopes: string[], client = admin, org = orgId) {
    const res = await client.post(api('/api-keys', org), { name: 'Fire panel', scopes });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ key: { id: string; prefix: string }; token: string }>();
  }

  /** A webhook pointing at the local receiver (stored directly: the API accepts https only). */
  async function localWebhook(events: string[], org = orgId) {
    const id = crypto.randomUUID();
    const secret = 'whsec_test-secret';
    await h.db
      .insertInto('webhooks')
      .values({
        id,
        org_id: org,
        name: 'Local',
        url: receiverUrl,
        events,
        secret_enc: keys.encrypt(secret, secretAad(id)),
      })
      .execute();
    return { id, secret };
  }

  const deliver = () => runWebhookDeliveries({ db: h.db, keys, mailer: h.mailer, env: h.env });

  beforeEach(async () => {
    received = [];
    answer = 200;
    h = await createHarness({ WIDGET_FETCH_ALLOW_PRIVATE: 'true' });
    keys = new KeyRing(h.env.ENCRYPTION_KEY);
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    const editorId = await insertUser(h.db, 'editor@school.example');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    otherOrgId = await insertOrg(
      h.db,
      await insertUser(h.db, 'outsider@other.example'),
      'Other',
      false,
    );
    admin = await login(h.app, 'admin@school.example');
    editor = await login(h.app, 'editor@school.example');
    outsider = await login(h.app, 'outsider@other.example');
  });
  afterEach(() => h.close());

  it('lets admins create keys shown once, stored as a hash, and revoke them', async () => {
    expect(
      (await editor.post(api('/api-keys'), { name: 'x', scopes: ['screens:read'] })).statusCode,
    ).toBe(403);
    expect(
      (await admin.post(api('/api-keys'), { name: 'x', scopes: ['everything'] })).statusCode,
    ).toBe(400);
    const { key, token } = await createKey(['screens:read']);
    expect(token).toMatch(/^rbk_[A-Za-z0-9_-]{43}$/);
    expect(key.prefix).toBe(token.slice(0, 12));
    const stored = await h.db.selectFrom('api_keys').selectAll().executeTakeFirstOrThrow();
    expect(JSON.stringify(stored)).not.toContain(token);
    // The list never shows the key again.
    const list = await admin.get(api('/api-keys'));
    expect(list.body).not.toContain(token);
    expect(list.json<{ keys: { active: boolean }[] }>().keys).toMatchObject([{ active: true }]);

    expect((await integration('GET', '/screens', token)).statusCode).toBe(200);
    const used = await h.db
      .selectFrom('api_keys')
      .select(['last_used_at', 'last_used_ip'])
      .executeTakeFirstOrThrow();
    expect(used.last_used_at).not.toBeNull();
    expect(used.last_used_ip).toBe('127.0.0.0/24');

    expect((await admin.delete(api(`/api-keys/${key.id}`))).statusCode).toBe(204);
    expect((await integration('GET', '/screens', token)).statusCode).toBe(401);
    const audits = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('org_id', '=', orgId)
      .execute();
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['api_key.created', 'api_key.revoked']),
    );
  });

  it('refuses unknown, expired and out-of-scope keys, and other organizations', async () => {
    expect((await integration('GET', '/screens', 'rbk_nope')).statusCode).toBe(401);
    expect(
      (await h.app.inject({ method: 'GET', url: '/api/integrations/v1/screens' })).statusCode,
    ).toBe(401);
    const { token } = await createKey(['screens:read']);
    // Wrong scope.
    const alert = await integration('POST', '/alerts', token, { style: 'notice', title: 'Hi' });
    expect(alert.statusCode).toBe(403);
    // Expired.
    await h.db
      .updateTable('api_keys')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    expect((await integration('GET', '/screens', token)).statusCode).toBe(401);
    // Another organization's admin cannot see or revoke this organization's keys.
    const [row] = await h.db.selectFrom('api_keys').select('id').execute();
    expect((await outsider.get(api('/api-keys'))).statusCode).toBe(404);
    expect((await outsider.delete(api(`/api-keys/${row!.id}`, otherOrgId))).statusCode).toBe(404);
  });

  it('starts and ends emergency alerts from an integration, named after its key', async () => {
    const { token } = await createKey(['alerts:write']);
    const started = await integration('POST', '/alerts', token, {
      style: 'emergency',
      title: 'פינוי',
      message: 'צאו מהבניין',
    });
    expect(started.statusCode, started.body).toBe(201);
    const { alert } = started.json<{ alert: { id: string; active: boolean } }>();
    expect(alert.active).toBe(true);
    // The dashboard shows who started it: the key.
    const listed = (await admin.get(api('/alerts'))).json<{
      active: { id: string; createdBy: string | null }[];
    }>();
    expect(listed.active).toMatchObject([{ id: alert.id, createdBy: 'API: Fire panel' }]);
    expect(
      (await integration('GET', '/alerts', token)).json<{ alerts: unknown[] }>().alerts,
    ).toHaveLength(1);
    const ended = await integration('POST', `/alerts/${alert.id}/end`, token);
    expect(ended.statusCode).toBe(200);
    expect((await integration('POST', `/alerts/${alert.id}/end`, token)).statusCode).toBe(409);
    // Another organization's alert is "not found".
    const { token: otherToken } = await createKey(['alerts:write'], outsider, otherOrgId);
    expect((await integration('POST', `/alerts/${alert.id}/end`, otherToken)).statusCode).toBe(404);
    // Screens of another organization cannot be targeted.
    const foreign = await integration('POST', '/alerts', otherToken, {
      style: 'notice',
      title: 'x',
      screenIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(foreign.statusCode).toBe(400);
  });

  it('changes only the text of text and ticker widgets, and respects content approval', async () => {
    const text = (
      await admin.post(api('/widgets'), {
        type: 'text',
        name: 'Queue',
        config: { title: 'Next in line', text: '41' },
      })
    ).json<{ widget: { id: string } }>().widget.id;
    const clock = (
      await admin.post(api('/widgets'), { type: 'clock', name: 'Clock', config: {} })
    ).json<{ widget: { id: string } }>().widget.id;
    const { token } = await createKey(['widgets:write']);

    let res = await integration('PATCH', `/widgets/${text}`, token, { text: '42' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<{ widget: { config: Record<string, unknown> } }>().widget.config).toMatchObject(
      {
        title: 'Next in line',
        text: '42',
      },
    );
    res = await integration('PATCH', `/widgets/${text}`, token, { title: null });
    expect(
      res.json<{ widget: { config: Record<string, unknown> } }>().widget.config,
    ).not.toHaveProperty('title');
    // Not the colors, not other fields, not other widget types, not empty text.
    expect(
      (await integration('PATCH', `/widgets/${text}`, token, { background: '#000' })).statusCode,
    ).toBe(400);
    expect((await integration('PATCH', `/widgets/${text}`, token, { label: 'x' })).statusCode).toBe(
      400,
    );
    expect((await integration('PATCH', `/widgets/${clock}`, token, { text: 'x' })).statusCode).toBe(
      400,
    );
    expect((await integration('PATCH', `/widgets/${text}`, token, { text: '' })).statusCode).toBe(
      400,
    );
    // Another organization's key: "not found".
    const { token: otherToken } = await createKey(['widgets:write'], outsider, otherOrgId);
    expect(
      (await integration('PATCH', `/widgets/${text}`, otherToken, { text: 'x' })).statusCode,
    ).toBe(404);
    // With content approval, integrations cannot change widgets.
    await h.db
      .updateTable('organizations')
      .set({ require_approval: true })
      .where('id', '=', orgId)
      .execute();
    expect((await integration('PATCH', `/widgets/${text}`, token, { text: '43' })).statusCode).toBe(
      409,
    );
    const audit = await h.db
      .selectFrom('audit_logs')
      .select('meta')
      .where('action', '=', 'widget.updated')
      .where('org_id', '=', orgId)
      .execute();
    expect(audit.some((row) => row.meta.apiKey === 'Fire panel')).toBe(true);
  });

  it('manages webhooks: https only, secret shown once and stored encrypted', async () => {
    expect(
      (
        await admin.post(api('/webhooks'), {
          name: 'x',
          url: 'http://hooks.example/x',
          events: ['alert.started'],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await admin.post(api('/webhooks'), {
          name: 'x',
          url: 'https://10.0.0.1/x',
          events: ['alert.started'],
        })
      ).statusCode,
    ).toBe(400);
    // Only the default https port (others cannot be reached when sending).
    expect(
      (
        await admin.post(api('/webhooks'), {
          name: 'x',
          url: 'https://hooks.example:8443/x',
          events: ['alert.started'],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await editor.post(api('/webhooks'), {
          name: 'x',
          url: 'https://hooks.example/x',
          events: ['alert.started'],
        })
      ).statusCode,
    ).toBe(403);
    const created = await admin.post(api('/webhooks'), {
      name: 'Teams',
      url: 'https://hooks.example/x',
      events: ['alert.started', 'screen.offline'],
    });
    expect(created.statusCode, created.body).toBe(201);
    const { webhook, secret } = created.json<{ webhook: { id: string }; secret: string }>();
    expect(secret).toMatch(/^whsec_/);
    const row = await h.db.selectFrom('webhooks').selectAll().executeTakeFirstOrThrow();
    expect(row.secret_enc.toString('utf8')).not.toContain(secret);
    expect((await admin.get(api('/webhooks'))).body).not.toContain(secret);

    const rotated = await admin.post(api(`/webhooks/${webhook.id}/secret`));
    expect(rotated.json<{ secret: string }>().secret).not.toBe(secret);
    const off = await admin.patch(api(`/webhooks/${webhook.id}`), { enabled: false });
    expect(off.json()).toMatchObject({ webhook: { enabled: false, disabledReason: 'manual' } });
    expect((await outsider.delete(api(`/webhooks/${webhook.id}`, otherOrgId))).statusCode).toBe(
      404,
    );
    expect((await admin.delete(api(`/webhooks/${webhook.id}`))).statusCode).toBe(204);
  });

  it('delivers signed events once, for subscribed webhooks of the same organization only', async () => {
    const hook = await localWebhook(['alert.started']);
    await localWebhook(['screen.offline']);
    await localWebhook(['alert.started'], otherOrgId);
    const started = await admin.post(api('/alerts'), { style: 'notice', title: 'Assembly' });
    expect(started.statusCode).toBe(201);

    expect(await deliver()).toBe(1);
    expect(await deliver()).toBe(0);
    expect(received).toHaveLength(1);
    const [delivery] = received;
    expect(delivery!.headers['rubinny-event']).toBe('alert.started');
    const body = JSON.parse(delivery!.body) as {
      event: string;
      organization: { id: string };
      data: { alert: { title: string } };
    };
    expect(body).toMatchObject({ event: 'alert.started', organization: { id: orgId } });
    expect(body.data.alert.title).toBe('Assembly');
    // No people in payloads.
    expect(delivery!.body).not.toContain('admin@school.example');
    // The signature checks out with the webhook's secret.
    const signature = String(delivery!.headers['rubinny-signature']);
    const t = Number(/t=(\d+)/.exec(signature)?.[1]);
    expect(Math.abs(t - Date.now() / 1000)).toBeLessThan(60);
    expect(signature).toBe(signPayload(hook.secret, delivery!.body, t));
    const logged = await admin.get(api(`/webhooks/${hook.id}/deliveries`));
    expect(logged.json()).toMatchObject({
      deliveries: [{ event: 'alert.started', status: 'delivered', statusCode: 200, attempts: 1 }],
    });
  });

  it('retries failures later, and turns off a webhook that keeps failing', async () => {
    const hook = await localWebhook(['alert.started']);
    answer = 500;
    await admin.post(api('/alerts'), { style: 'notice', title: 'One' });
    expect(await deliver()).toBe(1);
    const pending = await h.db
      .selectFrom('webhook_deliveries')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(pending).toMatchObject({ status: 'pending', attempts: 1, last_status_code: 500 });
    expect(pending.next_attempt_at.getTime()).toBeGreaterThan(Date.now() + 50_000);
    // Not due yet.
    expect(await deliver()).toBe(0);
    // Due again: it succeeds and the failure count resets.
    answer = 200;
    await h.db.updateTable('webhook_deliveries').set({ next_attempt_at: new Date() }).execute();
    expect(await deliver()).toBe(1);
    expect(
      (await h.db.selectFrom('webhooks').select('failure_count').executeTakeFirstOrThrow())
        .failure_count,
    ).toBe(0);

    // A burst of failures during a short outage does not turn it off.
    answer = 500;
    await h.db
      .updateTable('webhooks')
      .set({ failure_count: DISABLE_AFTER_FAILURES + 5, failing_since: new Date() })
      .where('id', '=', hook.id)
      .execute();
    await admin.post(api('/alerts'), { style: 'notice', title: 'Burst' });
    await deliver();
    expect(
      (await h.db.selectFrom('webhooks').select('enabled').executeTakeFirstOrThrow()).enabled,
    ).toBe(true);

    // Failing for hours, many times in a row: turned off, and admins get an e-mail.
    await h.db
      .updateTable('webhooks')
      .set({
        failure_count: DISABLE_AFTER_FAILURES - 1,
        failing_since: new Date(Date.now() - (DISABLE_AFTER_HOURS + 1) * 3600 * 1000),
      })
      .where('id', '=', hook.id)
      .execute();
    await admin.post(api('/alerts'), { style: 'notice', title: 'Two' });
    await deliver();
    const off = await h.db
      .selectFrom('webhooks')
      .select(['enabled', 'disabled_reason'])
      .executeTakeFirstOrThrow();
    expect(off).toEqual({ enabled: false, disabled_reason: 'failures' });
    expect(h.mailer.lastTo('admin@school.example')?.template).toMatchObject({
      kind: 'webhook-disabled',
    });
    // Nothing more is queued for it.
    await admin.post(api('/alerts'), { style: 'notice', title: 'Three' });
    const queued = await h.db
      .selectFrom('webhook_deliveries')
      .select('id')
      .where('status', '=', 'pending')
      .where('next_attempt_at', '<=', new Date())
      .execute();
    expect(queued).toHaveLength(0);
  });

  it('sends "alert.ended" once for alerts that end on their own', async () => {
    await localWebhook(['alert.ended']);
    const started = (
      await admin.post(api('/alerts'), { style: 'notice', title: 'Short', durationMinutes: 1 })
    ).json<{ alert: { id: string } }>().alert;
    expect(await reportExpiredAlerts({ db: h.db })).toBe(0);
    await h.db
      .updateTable('alerts')
      .set({ starts_at: new Date(Date.now() - 120_000), ends_at: new Date(Date.now() - 1000) })
      .where('id', '=', started.id)
      .execute();
    expect(await reportExpiredAlerts({ db: h.db })).toBe(1);
    expect(await reportExpiredAlerts({ db: h.db })).toBe(0);
    await deliver();
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!.body)).toMatchObject({
      event: 'alert.ended',
      data: { alert: { id: started.id, expired: true } },
    });
    // Ended by hand: reported then, not again when its time passes.
    const other = (
      await admin.post(api('/alerts'), { style: 'notice', title: 'Manual', durationMinutes: 1 })
    ).json<{ alert: { id: string } }>().alert;
    await admin.post(api(`/alerts/${other.id}/end`));
    await h.db
      .updateTable('alerts')
      .set({ starts_at: new Date(Date.now() - 120_000), ends_at: new Date(Date.now() - 1000) })
      .where('id', '=', other.id)
      .execute();
    expect(await reportExpiredAlerts({ db: h.db })).toBe(0);
  });

  it('watches screens for a webhook that wants only "screen.online"', async () => {
    await localWebhook(['screen.online']);
    const screen = await h.db
      .insertInto('screens')
      .values({
        org_id: orgId,
        name: 'Hall',
        token_hash: 'y'.repeat(64),
        last_seen_at: new Date(Date.now() - 60 * 60 * 1000),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const deps = { db: h.db, mailer: h.mailer, publicUrl: PUBLIC_URL };
    expect((await runOfflineAlerts(deps, new Date(Date.now() - 24 * 3600 * 1000))).screens).toBe(1);
    await reportScreenBack(deps, screen.id);
    await deliver();
    expect(received.map((r) => r.headers['rubinny-event'])).toEqual(['screen.online']);
  });

  it('refuses an address that kept failing key checks before looking keys up', async () => {
    const { token } = await createKey(['screens:read']);
    for (let i = 0; i < 30; i++) {
      expect((await integration('GET', '/screens', `rbk_${'x'.repeat(43)}`)).statusCode).toBe(401);
    }
    // Even a valid key is refused from that address for a while.
    expect((await integration('GET', '/screens', token)).statusCode).toBe(429);
  });

  it('tells webhooks when screens go offline and come back, without e-mail if not wanted', async () => {
    await localWebhook(['screen.offline', 'screen.online']);
    const screen = await h.db
      .insertInto('screens')
      .values({
        org_id: orgId,
        name: 'Lobby',
        token_hash: 'x'.repeat(64),
        last_seen_at: new Date(Date.now() - 60 * 60 * 1000),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const deps = { db: h.db, mailer: h.mailer, publicUrl: PUBLIC_URL };
    const result = await runOfflineAlerts(deps, new Date(Date.now() - 24 * 3600 * 1000));
    expect(result.screens).toBe(1);
    // This organization did not ask for offline e-mails.
    expect(h.mailer.sent.filter((m) => m.template.kind === 'screens-offline')).toHaveLength(0);
    await reportScreenBack(deps, screen.id);
    expect(await deliver()).toBe(2);
    expect(received.map((r) => r.headers['rubinny-event']).sort()).toEqual([
      'screen.offline',
      'screen.online',
    ]);
    expect(received.find((r) => r.headers['rubinny-event'] === 'screen.offline')?.body).toContain(
      'Lobby',
    );
  });

  it('sends a test ping and reports the answer; old deliveries are removed', async () => {
    const hook = await localWebhook(['alert.started']);
    const ok = await admin.post(api(`/webhooks/${hook.id}/test`));
    expect(ok.json()).toEqual({ ok: true, status: 200, error: null });
    expect(received[0]?.headers['rubinny-event']).toBe('ping');
    answer = 404;
    const failed = await admin.post(api(`/webhooks/${hook.id}/test`));
    expect(failed.json()).toMatchObject({ ok: false, status: 404 });

    await admin.post(api('/alerts'), { style: 'notice', title: 'Old' });
    await h.db
      .updateTable('webhook_deliveries')
      .set({ created_at: new Date(Date.now() - 8 * 24 * 3600 * 1000) })
      .execute();
    const removed = await runMaintenance(h.db, 365, 365);
    expect(removed.webhookDeliveries).toBe(1);
  });
});

describe.runIf(integrationEnabled)('webhooks to refused addresses', () => {
  it('reads like any failed connection, so internal names cannot be probed (security review, B3)', async () => {
    const h = await createHarness();
    try {
      const orgId = await insertOrg(
        h.db,
        await insertUser(h.db, 'owner@hooks.example'),
        'H',
        false,
      );
      const owner = await login(h.app, 'owner@hooks.example');
      const keys = new KeyRing(h.env.ENCRYPTION_KEY);
      const id = crypto.randomUUID();
      await h.db
        .insertInto('webhooks')
        .values({
          id,
          org_id: orgId,
          name: 'Internal',
          // Resolves to a loopback address: refused by the outbound request guard.
          url: 'https://localhost/hook',
          events: ['alert.started'],
          secret_enc: keys.encrypt('whsec_x', secretAad(id)),
        })
        .execute();
      const res = await owner.post(`/api/v1/orgs/${orgId}/webhooks/${id}/test`);
      expect(res.json()).toEqual({ ok: false, status: null, error: 'network' });
    } finally {
      await h.close();
    }
  });
});
