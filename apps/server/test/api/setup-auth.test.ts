import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  STRONG_PASSWORD,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  tokenFromMail,
  type Harness,
} from '../support/harness.js';

describe.runIf(integrationEnabled)('setup', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness({ SETUP_TOKEN: 'setup-token-0123456789' });
  });
  afterEach(() => h.close());

  const payload = {
    setupToken: 'setup-token-0123456789',
    email: 'Owner@Example.com',
    password: STRONG_PASSWORD,
    name: 'Dana',
    orgName: 'בית הכנסת',
  };

  it('creates the first owner exactly once', async () => {
    const client = new Client(h.app);
    expect((await client.get('/api/v1/setup/status')).json()).toEqual({
      needsSetup: true,
      setupTokenRequired: true,
    });

    expect(
      (await client.post('/api/v1/setup', { ...payload, setupToken: 'wrong' })).statusCode,
    ).toBe(403);

    const res = await client.post('/api/v1/setup', payload);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ user: { email: 'owner@example.com', emailVerified: true } });

    const session = await client.get('/api/v1/auth/session');
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ memberships: [{ name: 'בית הכנסת', role: 'OWNER' }] });
    const audit = await h.db.selectFrom('audit_logs').select(['action', 'org_id']).execute();
    expect(audit).toContainEqual({
      action: 'setup.completed',
      org_id: expect.any(String) as string,
    });

    expect((await new Client(h.app).post('/api/v1/setup', payload)).statusCode).toBe(409);
    expect((await client.get('/api/v1/setup/status')).json()).toMatchObject({ needsSetup: false });
  });

  it('serializes concurrent setup attempts', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        new Client(h.app).post('/api/v1/setup', { ...payload, email: `o${i}@example.com` }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
  });

  it('enforces the password policy', async () => {
    const res = await new Client(h.app).post('/api/v1/setup', { ...payload, password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: [{ path: 'password', reason: 'too_short' }] },
    });
    const missing = await new Client(h.app).post('/api/v1/setup', {
      ...payload,
      email: 'not-an-email',
    });
    expect(missing.json()).toMatchObject({ error: { fields: [{ path: 'email' }] } });
  });
});

describe.runIf(integrationEnabled)('login and sessions', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    const id = await insertUser(h.db, 'dana@example.com');
    await insertOrg(h.db, id);
  });
  afterEach(() => h.close());

  it('logs in, exposes the session and logs out', async () => {
    const client = await login(h.app, 'DANA@example.com');
    expect(client.cookie).toBeDefined();
    const session = await client.get('/api/v1/auth/session');
    expect(session.json()).toMatchObject({ user: { email: 'dana@example.com' } });
    expect(session.body).not.toContain('password');

    expect((await client.post('/api/v1/auth/logout')).statusCode).toBe(204);
    expect(client.cookie).toBeUndefined();
    expect((await client.get('/api/v1/auth/session')).statusCode).toBe(401);
  });

  it('sets a hardened session cookie', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'dana@example.com', password: STRONG_PASSWORD },
    });
    const cookie = res.cookies.find((c) => c.name === 'rubinny_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Only the hash is stored.
    const stored = await h.db.selectFrom('sessions').select('id_hash').execute();
    expect(stored.map((s) => s.id_hash)).not.toContain(cookie?.value);
  });

  it('returns the same error for unknown users and wrong passwords', async () => {
    const client = new Client(h.app);
    const wrong = await client.post('/api/v1/auth/login', {
      email: 'dana@example.com',
      password: 'nope-nope-nope',
    });
    const unknown = await client.post('/api/v1/auth/login', {
      email: 'ghost@example.com',
      password: 'nope-nope-nope',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json<{ error: { message: string } }>().error.message).toBe(
      unknown.json<{ error: { message: string } }>().error.message,
    );
  });

  it('rate-limits password guessing per account across IPs', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await new Client(h.app, `198.51.100.${i}`).post('/api/v1/auth/login', {
        email: 'dana@example.com',
        password: `wrong-password-${i}`,
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('rejects stale and forged cookies', async () => {
    const forged = new Client(h.app);
    forged.cookie = 'rubinny_session=forged-token-forged-token-forged-token-1234';
    expect((await forged.get('/api/v1/auth/session')).statusCode).toBe(401);

    const client = await login(h.app, 'dana@example.com');
    await h.db
      .updateTable('sessions')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    expect((await client.get('/api/v1/auth/session')).statusCode).toBe(401);
  });

  it('blocks cross-site state-changing requests (CSRF)', async () => {
    const client = await login(h.app, 'dana@example.com');
    const evil = await client.request(
      'POST',
      '/api/v1/auth/logout-all',
      {},
      { origin: 'https://evil.example' },
    );
    expect(evil.statusCode).toBe(403);
    const fetchSite = await client.request(
      'POST',
      '/api/v1/auth/logout-all',
      {},
      { 'sec-fetch-site': 'cross-site' },
    );
    expect(fetchSite.statusCode).toBe(403);
    expect((await client.get('/api/v1/auth/session')).statusCode).toBe(200);

    const same = await client.request(
      'POST',
      '/api/v1/auth/logout-all',
      {},
      { origin: 'http://localhost:3000' },
    );
    expect(same.statusCode).toBe(204);
  });

  it('logout-all revokes every session of the user', async () => {
    const a = await login(h.app, 'dana@example.com');
    const b = await login(h.app, 'dana@example.com');
    await a.post('/api/v1/auth/logout-all');
    expect((await b.get('/api/v1/auth/session')).statusCode).toBe(401);
  });
});

describe.runIf(integrationEnabled)('registration and email verification', () => {
  let h: Harness;
  afterEach(() => h.close());

  it('requires an invitation in invite mode', async () => {
    h = await createHarness({ REGISTRATION_MODE: 'invite' });
    const res = await new Client(h.app).post('/api/v1/auth/register', {
      email: 'new@example.com',
      password: STRONG_PASSWORD,
      name: 'New',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'REGISTRATION_CLOSED' } });
  });

  it('registers, verifies the email and then allows login (open mode)', async () => {
    h = await createHarness({ REGISTRATION_MODE: 'open' });
    const client = new Client(h.app);
    const res = await client.post('/api/v1/auth/register', {
      email: 'new@example.com',
      password: STRONG_PASSWORD,
      name: 'Noa',
      orgName: 'Noa Cafe',
      locale: 'en',
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'verification_required' });

    const blocked = await client.post('/api/v1/auth/login', {
      email: 'new@example.com',
      password: STRONG_PASSWORD,
    });
    expect(blocked.json()).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });

    const mail = h.mailer.lastTo('new@example.com');
    expect(mail?.subject).toBe('Verify your Rubinny email address');
    const token = tokenFromMail(h.mailer, 'new@example.com');
    expect((await client.post('/api/v1/auth/verify-email', { token })).statusCode).toBe(200);
    expect((await client.post('/api/v1/auth/verify-email', { token })).statusCode).toBe(400);

    const ok = await client.post('/api/v1/auth/login', {
      email: 'new@example.com',
      password: STRONG_PASSWORD,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ memberships: [{ name: 'Noa Cafe', role: 'OWNER' }] });
  });

  it('does not reveal whether an email is already registered', async () => {
    h = await createHarness({ REGISTRATION_MODE: 'open' });
    await insertUser(h.db, 'taken@example.com');
    const res = await new Client(h.app).post('/api/v1/auth/register', {
      email: 'taken@example.com',
      password: STRONG_PASSWORD,
      name: 'Someone',
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'verification_required' });
    expect(h.mailer.lastTo('taken@example.com')?.template.kind).toBe('account-exists');
    const users = await h.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'taken@example.com')
      .execute();
    expect(users).toHaveLength(1);
  });

  it('resend does not reveal account existence', async () => {
    h = await createHarness({ REGISTRATION_MODE: 'open' });
    const client = new Client(h.app);
    const unknown = await client.post('/api/v1/auth/verify-email/resend', {
      email: 'ghost@example.com',
    });
    expect(unknown.statusCode).toBe(202);
    expect(h.mailer.sent).toHaveLength(0);
  });
});

describe.runIf(integrationEnabled)('password reset and change', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await insertOrg(h.db, await insertUser(h.db, 'dana@example.com'));
  });
  afterEach(() => h.close());

  it('resets the password with an emailed token and revokes sessions', async () => {
    const existing = await login(h.app, 'dana@example.com');
    const client = new Client(h.app);

    expect(
      (await client.post('/api/v1/auth/password/forgot', { email: 'ghost@example.com' }))
        .statusCode,
    ).toBe(202);
    expect(h.mailer.sent).toHaveLength(0);

    expect(
      (await client.post('/api/v1/auth/password/forgot', { email: 'dana@example.com' })).statusCode,
    ).toBe(202);
    const token = tokenFromMail(h.mailer, 'dana@example.com');
    expect(h.mailer.lastTo('dana@example.com')?.text).toContain('/reset-password#token=');

    const weak = await client.post('/api/v1/auth/password/reset', { token, password: 'short' });
    expect(weak.statusCode).toBe(400);

    const newPassword = 'a brand new long passphrase';
    const res = await client.post('/api/v1/auth/password/reset', { token, password: newPassword });
    expect(res.statusCode).toBe(200);
    expect(
      (await client.post('/api/v1/auth/password/reset', { token, password: newPassword }))
        .statusCode,
    ).toBe(400);

    expect((await existing.get('/api/v1/auth/session')).statusCode).toBe(401);
    expect(h.mailer.lastTo('dana@example.com')?.template).toEqual({
      kind: 'security-notice',
      event: 'password-changed',
    });
    const relogin = await client.post('/api/v1/auth/login', {
      email: 'dana@example.com',
      password: newPassword,
    });
    expect(relogin.statusCode).toBe(200);
  });

  it('changes the password, keeping only the current session', async () => {
    const a = await login(h.app, 'dana@example.com');
    const b = await login(h.app, 'dana@example.com');
    const wrong = await a.post('/api/v1/auth/password/change', {
      currentPassword: 'not-the-password',
      newPassword: 'another long passphrase',
    });
    expect(wrong.statusCode).toBe(401);
    const ok = await a.post('/api/v1/auth/password/change', {
      currentPassword: STRONG_PASSWORD,
      newPassword: 'another long passphrase',
    });
    expect(ok.statusCode).toBe(200);
    expect((await a.get('/api/v1/auth/session')).statusCode).toBe(200);
    expect((await b.get('/api/v1/auth/session')).statusCode).toBe(401);
  });
});
