// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { safeReturnTo } from '../../src/modules/auth/oidc.js';
import {
  Client,
  PUBLIC_URL,
  createHarness,
  currentCode,
  enableMfa,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  STRONG_PASSWORD,
  type Harness,
} from '../support/harness.js';
import {
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  startTestProvider,
  throughProvider,
} from '../support/oidc-op.js';

describe('safeReturnTo', () => {
  it('keeps paths inside the dashboard only', () => {
    expect(safeReturnTo('/orgs/1/screens?x=1')).toBe('/orgs/1/screens?x=1');
    for (const evil of [
      undefined,
      '',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/api/v1/me',
      '/\nSet-Cookie: x',
    ]) {
      expect(safeReturnTo(evil)).toBe('/');
    }
  });
});

describe.runIf(integrationEnabled)('sign-in through an OpenID Connect provider', () => {
  const callback = `${PUBLIC_URL}/api/v1/auth/oidc/callback`;
  let op: Awaited<ReturnType<typeof startTestProvider>>;
  let h: Harness;

  beforeAll(async () => {
    op = await startTestProvider(callback);
  });
  afterAll(async () => {
    await op.close();
  });
  afterEach(async () => {
    await h.close();
  });

  const harness = (env: Record<string, string> = {}) =>
    createHarness({
      OIDC_ISSUER: op.issuer,
      OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET,
      OIDC_NAME: 'Test school',
      ...env,
    });

  /** The whole browser round trip; returns the final response of the callback. */
  async function ssoSignIn(returnTo = '/orgs', ip = '198.51.100.20') {
    const browser = new Client(h.app, ip);
    const start = await browser.get(
      `/api/v1/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(start.statusCode, start.body).toBe(302);
    const state = start.cookies.find((c) => c.name === 'rubinny_oidc');
    expect(state?.httpOnly).toBe(true);
    const back = await throughProvider(String(start.headers.location), callback);
    const res = await browser.request('GET', `${back.pathname}${back.search}`, undefined, {
      cookie: `rubinny_oidc=${state?.value ?? ''}`,
    });
    return { res, browser, back, state: state?.value ?? '' };
  }

  it('tells the sign-in page about the provider (or not)', async () => {
    h = await createHarness();
    expect((await h.app.inject({ url: '/api/v1/auth/providers' })).json()).toEqual({ oidc: null });
    expect((await h.app.inject({ url: '/api/v1/auth/oidc/start' })).statusCode).toBe(404);
    await h.close();
    h = await harness();
    expect((await h.app.inject({ url: '/api/v1/auth/providers' })).json()).toEqual({
      oidc: { name: 'Test school' },
    });
  });

  it('signs in an existing user by verified e-mail, then by the stable subject', async () => {
    h = await harness();
    const userId = await insertUser(h.db, 'dana@school.example');
    op.signInAs({ sub: 'dana-1', email: 'Dana@School.example', email_verified: true });
    const { res, browser } = await ssoSignIn('/orgs/abc');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${PUBLIC_URL}/orgs/abc`);
    const session = await browser.get('/api/v1/auth/session');
    expect(session.json()).toMatchObject({ user: { id: userId, email: 'dana@school.example' } });

    const identities = await browser.get('/api/v1/me/identities');
    expect(identities.json()).toMatchObject({
      identities: [{ issuer: op.issuer, email: 'dana@school.example' }],
    });

    // The provider changes her address: she is still recognized by her subject.
    op.signInAs({ sub: 'dana-1', email: 'dana.cohen@school.example', email_verified: true });
    const again = await ssoSignIn();
    expect(again.res.headers.location).toBe(`${PUBLIC_URL}/orgs`);
    expect((await again.browser.get('/api/v1/auth/session')).json()).toMatchObject({
      user: { id: userId },
    });
    const actions = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'meta'])
      .where('actor_user_id', '=', userId)
      .execute();
    expect(actions.filter((a) => a.action === 'auth.login.success')).toHaveLength(2);
  });

  it('never links by an unverified address', async () => {
    h = await harness();
    await insertUser(h.db, 'victim@school.example');
    op.signInAs({ sub: 'attacker', email: 'victim@school.example', email_verified: false });
    const { res, browser } = await ssoSignIn();
    expect(res.headers.location).toBe(`${PUBLIC_URL}/login?sso=unverified_email`);
    expect((await browser.get('/api/v1/auth/session')).statusCode).toBe(401);
    expect(await h.db.selectFrom('user_identities').selectAll().execute()).toEqual([]);
  });

  it('takes over an account whose address was never verified: old credentials stop working', async () => {
    // Someone registered the address first, through the API (verification off, so they could
    // sign in). Registering does not prove the address (security review, finding A3).
    h = await harness({ REQUIRE_EMAIL_VERIFICATION: 'false', REGISTRATION_MODE: 'open' });
    const squatter = new Client(h.app, '198.51.100.40');
    const registered = await squatter.post('/api/v1/auth/register', {
      email: 'owner@school.example',
      password: STRONG_PASSWORD,
      name: 'Squatter',
    });
    expect(registered.statusCode, registered.body).toBe(201);
    expect(
      (
        await squatter.post('/api/v1/auth/login', {
          email: 'owner@school.example',
          password: STRONG_PASSWORD,
        })
      ).statusCode,
    ).toBe(200);
    const session = await squatter.get('/api/v1/auth/session');
    expect(session.json()).toMatchObject({ user: { emailVerified: false } });
    const userId = session.json<{ user: { id: string } }>().user.id;

    op.signInAs({ sub: 'owner-1', email: 'owner@school.example', email_verified: true });
    const { browser } = await ssoSignIn();
    expect((await browser.get('/api/v1/auth/session')).json()).toMatchObject({
      user: { id: userId, emailVerified: true, hasPassword: false },
    });
    // The squatter's session and password are gone.
    expect((await squatter.get('/api/v1/auth/session')).statusCode).toBe(401);
    const again = await new Client(h.app, '198.51.100.41').post('/api/v1/auth/login', {
      email: 'owner@school.example',
      password: STRONG_PASSWORD,
    });
    expect(again.statusCode).toBe(401);
  });

  it('names the state cookie so browsers accept it over https', async () => {
    h = await harness({ PUBLIC_URL: 'https://signage.example' });
    const start = await h.app.inject({ url: '/api/v1/auth/oidc/start' });
    expect(start.statusCode).toBe(302);
    const cookie = start.cookies.find((c) => c.name.endsWith('rubinny_oidc'));
    // __Host- would need Path=/ (RFC 6265bis); this cookie is scoped to the OIDC routes.
    expect(cookie).toMatchObject({
      name: '__Secure-rubinny_oidc',
      path: '/api/v1/auth/oidc',
      secure: true,
    });
  });

  it('creates accounts only with an invitation (invite mode), without a usable password', async () => {
    h = await harness();
    op.signInAs({ sub: 'new-1', email: 'new@school.example', email_verified: true, name: 'Noa' });
    expect((await ssoSignIn()).res.headers.location).toBe(`${PUBLIC_URL}/login?sso=not_invited`);

    const owner = await insertUser(h.db, 'owner@school.example');
    const orgId = await insertOrg(h.db, owner, 'School', false);
    const admin = await login(h.app, 'owner@school.example');
    const invited = await admin.post(`/api/v1/orgs/${orgId}/invitations`, {
      email: 'new@school.example',
      role: 'EDITOR',
    });
    expect(invited.statusCode, invited.body).toBe(201);

    const { res, browser } = await ssoSignIn();
    expect(res.headers.location).toBe(`${PUBLIC_URL}/orgs`);
    const session = (await browser.get('/api/v1/auth/session')).json<{
      user: { name: string; hasPassword: boolean; emailVerified: boolean };
      memberships: { orgId: string; role: string }[];
    }>();
    expect(session.user).toMatchObject({ name: 'Noa', hasPassword: false, emailVerified: true });
    expect(session.memberships).toEqual([expect.objectContaining({ orgId, role: 'EDITOR' })]);

    // Their only way in cannot be unlinked; the account can be deleted after a fresh sign-in.
    const [identity] = (await browser.get('/api/v1/me/identities')).json<{
      identities: { id: string }[];
    }>().identities;
    const unlink = await browser.delete(`/api/v1/me/identities/${identity!.id}`);
    expect(unlink.statusCode).toBe(409);
    expect((await browser.delete('/api/v1/me', {})).statusCode).toBe(204);
    expect(await h.db.selectFrom('user_identities').selectAll().execute()).toEqual([]);
  });

  it('accepts only the allowed e-mail domains', async () => {
    h = await harness({ OIDC_ALLOWED_DOMAINS: 'school.example, other.example' });
    await insertUser(h.db, 'x@gmail.example');
    op.signInAs({ sub: 'x', email: 'x@gmail.example', email_verified: true });
    expect((await ssoSignIn()).res.headers.location).toBe(`${PUBLIC_URL}/login?sso=domain`);
  });

  it('refuses replays, foreign browsers and cancelled sign-ins', async () => {
    h = await harness();
    await insertUser(h.db, 'dana@school.example');
    op.signInAs({ sub: 'dana-1', email: 'dana@school.example', email_verified: true });
    const first = await ssoSignIn();
    expect(first.res.headers.location).toBe(`${PUBLIC_URL}/orgs`);

    // The same callback again (a replayed code and state).
    const replay = await new Client(h.app).request(
      'GET',
      `${first.back.pathname}${first.back.search}`,
      undefined,
      { cookie: `rubinny_oidc=${first.state}` },
    );
    expect(replay.headers.location).toBe(`${PUBLIC_URL}/login?sso=expired`);

    // A callback without the cookie of the browser that started it (login CSRF).
    const browser = new Client(h.app);
    const start = await browser.get('/api/v1/auth/oidc/start');
    const back = await throughProvider(String(start.headers.location), callback);
    const foreign = await new Client(h.app).get(`${back.pathname}${back.search}`);
    expect(foreign.headers.location).toBe(`${PUBLIC_URL}/login?sso=expired`);

    op.denyNext();
    expect((await ssoSignIn()).res.headers.location).toBe(`${PUBLIC_URL}/login?sso=cancelled`);
  });

  it('asks for the second factor of users with MFA', async () => {
    h = await harness();
    await insertUser(h.db, 'dana@school.example');
    const dana = await login(h.app, 'dana@school.example');
    const { secret } = await enableMfa(dana);
    op.signInAs({ sub: 'dana-1', email: 'dana@school.example', email_verified: true });

    const { res, browser } = await ssoSignIn('/orgs/x');
    const location = new URL(String(res.headers.location));
    expect(location.pathname).toBe('/login');
    expect(location.search).toBe('');
    const fragment = new URLSearchParams(location.hash.slice(1));
    expect(fragment.get('returnTo')).toBe('/orgs/x');
    expect((await browser.get('/api/v1/auth/session')).statusCode).toBe(401);

    const verified = await browser.post('/api/v1/auth/mfa/verify', {
      mfaToken: fragment.get('mfa'),
      code: currentCode(secret, 30_000), // the current one was used to enable MFA (no replays)
    });
    expect(verified.statusCode, verified.body).toBe(200);
    expect((await browser.get('/api/v1/auth/session')).statusCode).toBe(200);
  });
});
