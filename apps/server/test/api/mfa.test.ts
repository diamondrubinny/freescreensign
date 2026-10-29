// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Client,
  STRONG_PASSWORD,
  createHarness,
  currentCode,
  enableMfa,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

describe.runIf(integrationEnabled)('two-factor authentication (TOTP)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    await insertOrg(h.db, await insertUser(h.db, 'dana@example.com'));
  });
  afterEach(() => h.close());

  async function startLogin() {
    const client = new Client(h.app);
    const res = await client.post('/api/v1/auth/login', {
      email: 'dana@example.com',
      password: STRONG_PASSWORD,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ mfaRequired: boolean; mfaToken: string }>();
    expect(body.mfaRequired).toBe(true);
    expect(client.cookie).toBeUndefined(); // no session before the second factor
    return { client, mfaToken: body.mfaToken };
  }

  it('requires the password to start setup and a valid code to enable', async () => {
    const client = await login(h.app, 'dana@example.com');
    expect(
      (await client.post('/api/v1/auth/mfa/totp/setup', { password: 'wrong-password-x' }))
        .statusCode,
    ).toBe(401);

    const setup = await client.post('/api/v1/auth/mfa/totp/setup', { password: STRONG_PASSWORD });
    const { secret, otpauthUri } = setup.json<{ secret: string; otpauthUri: string }>();
    expect(otpauthUri).toContain('otpauth://totp/Rubinny');

    expect((await client.post('/api/v1/auth/mfa/totp/enable', { code: '000000' })).statusCode).toBe(
      400,
    );
    const enabled = await client.post('/api/v1/auth/mfa/totp/enable', {
      code: currentCode(secret),
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json<{ recoveryCodes: string[] }>().recoveryCodes).toHaveLength(10);

    const row = await h.db.selectFrom('users').select(['mfa_secret_enc']).executeTakeFirstOrThrow();
    expect(row.mfa_secret_enc?.toString('latin1')).not.toContain(secret); // encrypted at rest
    expect(h.mailer.lastTo('dana@example.com')?.template).toEqual({
      kind: 'security-notice',
      event: 'mfa-enabled',
    });
  });

  it('logs in with a TOTP code and rejects replays', async () => {
    const { secret } = await enableMfa(await login(h.app, 'dana@example.com'));

    const first = await startLogin();
    const wrong = await first.client.post('/api/v1/auth/mfa/verify', {
      mfaToken: first.mfaToken,
      code: '123456',
    });
    expect(wrong.statusCode).toBe(401);
    const code = currentCode(secret, 30_000);
    const ok = await first.client.post('/api/v1/auth/mfa/verify', {
      mfaToken: first.mfaToken,
      code,
    });
    expect(ok.statusCode).toBe(200);
    expect(first.client.cookie).toBeDefined();
    // The challenge is single-use.
    expect(
      (await first.client.post('/api/v1/auth/mfa/verify', { mfaToken: first.mfaToken, code }))
        .statusCode,
    ).toBe(401);

    const second = await startLogin();
    const replay = await second.client.post('/api/v1/auth/mfa/verify', {
      mfaToken: second.mfaToken,
      code,
    });
    expect(replay.statusCode).toBe(401);
  });

  it('limits attempts per challenge', async () => {
    await enableMfa(await login(h.app, 'dana@example.com'));
    const { client, mfaToken } = await startLogin();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push(
        (await client.post('/api/v1/auth/mfa/verify', { mfaToken, code: '000000' })).statusCode,
      );
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5).every((s) => s === 429 || s === 401)).toBe(true);
  });

  it('caps wrong codes per day, then tells the owner once (security review, A5)', async () => {
    const { secret } = await enableMfa(await login(h.app, 'dana@example.com'));
    const first = await startLogin();
    expect(
      (
        await first.client.post('/api/v1/auth/mfa/verify', {
          mfaToken: first.mfaToken,
          code: '000000',
        })
      ).statusCode,
    ).toBe(401);
    // As if 30 wrong codes had been typed today (they never reset).
    const [key] = await h.redis.keys('*mfa-failures-user-day:*');
    expect(await h.redis.get(key!)).toBe('1');
    await h.redis.set(key!, '30', 'KEEPTTL');
    const sentBefore = h.mailer.sent.length;
    for (let i = 0; i < 2; i++) {
      const next = await startLogin();
      const res = await next.client.post('/api/v1/auth/mfa/verify', {
        mfaToken: next.mfaToken,
        code: currentCode(secret, 30_000),
      });
      // Even the right code waits until tomorrow.
      expect(res.statusCode).toBe(429);
    }
    await vi.waitFor(() => {
      expect(h.mailer.sent.length).toBe(sentBefore + 1);
    });
    expect(h.mailer.lastTo('dana@example.com')?.template).toEqual({
      kind: 'security-notice',
      event: 'mfa-attempts',
    });
  });

  it('accepts each recovery code once', async () => {
    const { recoveryCodes } = await enableMfa(await login(h.app, 'dana@example.com'));
    const code = recoveryCodes[0]!;

    const a = await startLogin();
    const ok = await a.client.post('/api/v1/auth/mfa/verify', {
      mfaToken: a.mfaToken,
      recoveryCode: code.toLowerCase(),
    });
    expect(ok.statusCode).toBe(200);

    const b = await startLogin();
    expect(
      (await b.client.post('/api/v1/auth/mfa/verify', { mfaToken: b.mfaToken, recoveryCode: code }))
        .statusCode,
    ).toBe(401);
  });

  it('disables MFA only with password and a current code', async () => {
    const client = await login(h.app, 'dana@example.com');
    const { secret } = await enableMfa(client);
    const bad = await client.post('/api/v1/auth/mfa/totp/disable', {
      password: 'wrong-password-x',
      code: currentCode(secret, 30_000),
    });
    expect(bad.statusCode).toBe(401);
    const ok = await client.post('/api/v1/auth/mfa/totp/disable', {
      password: STRONG_PASSWORD,
      code: currentCode(secret, 30_000),
    });
    expect(ok.statusCode).toBe(200);
    const relogin = await new Client(h.app).post('/api/v1/auth/login', {
      email: 'dana@example.com',
      password: STRONG_PASSWORD,
    });
    expect(relogin.json()).toMatchObject({ mfaRequired: false });
    expect(await h.db.selectFrom('recovery_codes').selectAll().execute()).toHaveLength(0);
  });

  it('ends the other sessions when MFA is turned on or off (security review, A4)', async () => {
    // A session signed in with the password only (say, a stolen one) ...
    const other = await login(h.app, 'dana@example.com', '198.51.100.60');
    const client = await login(h.app, 'dana@example.com');
    const { secret, recoveryCodes } = await enableMfa(client);
    // ... does not become an MFA session when the owner turns MFA on.
    expect((await other.get('/api/v1/auth/session')).statusCode).toBe(401);
    expect((await client.get('/api/v1/auth/session')).statusCode).toBe(200);

    const third = new Client(h.app, '198.51.100.61');
    const challenge = await third.post('/api/v1/auth/login', {
      email: 'dana@example.com',
      password: STRONG_PASSWORD,
    });
    const verified = await third.post('/api/v1/auth/mfa/verify', {
      mfaToken: challenge.json<{ mfaToken: string }>().mfaToken,
      // A recovery code: each TOTP step works once, and disabling needs the next one.
      recoveryCode: recoveryCodes[0],
    });
    expect(verified.statusCode, verified.body).toBe(200);
    const off = await client.post('/api/v1/auth/mfa/totp/disable', {
      password: STRONG_PASSWORD,
      code: currentCode(secret, 30_000),
    });
    expect(off.statusCode, off.body).toBe(200);
    expect((await third.get('/api/v1/auth/session')).statusCode).toBe(401);
    expect((await client.get('/api/v1/auth/session')).statusCode).toBe(200);
  });
});
