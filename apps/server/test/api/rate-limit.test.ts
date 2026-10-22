// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/lib/crypto.js';
import {
  LookupBudget,
  VerifiedCredentials,
  deviceCredential,
  rateLimitKey,
  sessionCredential,
} from '../../src/lib/rate-limit-key.js';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

const request = (url: string, headers: Record<string, string>, ip = '198.51.100.7') =>
  ({ url, headers, ip }) as unknown as FastifyRequest;

describe('rate-limit buckets', () => {
  const token = randomBytes(32).toString('base64url');
  const session = randomBytes(32).toString('base64url');
  const bearer = { authorization: `Bearer ${token}` };
  const cookie = { cookie: `theme=x; __Host-rubinny_session=${session}` };
  const name = '__Host-rubinny_session';

  it('gives verified screens and sessions their own budget, everything else the IP', async () => {
    const known = new VerifiedCredentials();
    expect(
      await rateLimitKey(request('/player/v1/heartbeat', bearer), name, undefined, known),
    ).toBe('ip:198.51.100.7');
    known.remember(deviceCredential(sha256Hex(token)));
    known.remember(sessionCredential(sha256Hex(session)));
    expect(
      await rateLimitKey(request('/player/v1/heartbeat', bearer), name, undefined, known),
    ).toBe(deviceCredential(sha256Hex(token)));
    expect(await rateLimitKey(request('/api/v1/me', cookie), name, undefined, known)).toBe(
      sessionCredential(sha256Hex(session)),
    );
    // A device token only counts on player routes, and only well-formed values are read.
    expect(await rateLimitKey(request('/api/v1/me', bearer), 'x', undefined, known)).toBe(
      'ip:198.51.100.7',
    );
    expect(
      await rateLimitKey(
        request('/player/v1/heartbeat', { authorization: 'Bearer short' }),
        'x',
        undefined,
        known,
      ),
    ).toBe('ip:198.51.100.7');
  });

  it('checks unknown credentials once, within a budget per address', async () => {
    const known = new VerifiedCredentials();
    const lookups: string[] = [];
    const check = (kind: 'device' | 'session', hash: string) => {
      lookups.push(kind);
      return Promise.resolve(hash === sha256Hex(token));
    };
    const budget = new LookupBudget(2, 60_000);
    const key = () =>
      rateLimitKey(request('/player/v1/heartbeat', bearer), name, check, known, budget);
    expect(await key()).toBe(deviceCredential(sha256Hex(token)));
    expect(await key()).toBe(deviceCredential(sha256Hex(token)));
    expect(lookups).toEqual(['device']); // cached after the first check

    // Invented tokens: one lookup each, then no more lookups from that address.
    for (let i = 0; i < 4; i++) {
      const random = { authorization: `Bearer ${randomBytes(32).toString('base64url')}` };
      expect(
        await rateLimitKey(request('/player/v1/heartbeat', random), name, check, known, budget),
      ).toBe('ip:198.51.100.7');
    }
    expect(lookups).toEqual(['device', 'device']);
  });

  it('forgets the oldest credentials beyond its size', () => {
    const known = new VerifiedCredentials(2);
    known.remember('a');
    known.remember('b');
    known.remember('a'); // refreshed: now the newest
    known.remember('c');
    expect([known.has('a'), known.has('b'), known.has('c')]).toEqual([true, false, true]);
  });
});

describe.runIf(integrationEnabled)('rate limit behind one network address', () => {
  let h: Harness;
  afterEach(async () => {
    await h.close();
  });

  it('does not let screens of one school starve each other, but caps unknown tokens', async () => {
    h = await createHarness({ RATE_LIMIT_MAX: '6', RATE_LIMIT_WINDOW_MS: '60000' });
    const orgId = await insertOrg(
      h.db,
      await insertUser(h.db, 'owner@example.com'),
      'School',
      false,
    );
    const owner = await login(h.app, 'owner@example.com');
    const schoolIp = '203.0.113.50';

    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) {
      const player = new Client(h.app, schoolIp);
      const start = (await player.post('/player/v1/pair/start')).json<{
        code: string;
        pollToken: string;
      }>();
      expect(
        (await owner.post(`/api/v1/orgs/${orgId}/screens`, { code: start.code, name: `S${i}` }))
          .statusCode,
      ).toBe(201);
      tokens.push(
        (await player.post('/player/v1/pair/status', { pollToken: start.pollToken })).json<{
          deviceToken: string;
        }>().deviceToken,
      );
    }

    const heartbeat = (token: string) =>
      h.app.inject({
        method: 'POST',
        url: '/player/v1/heartbeat',
        remoteAddress: schoolIp,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

    // 3 screens × 5 heartbeats = 15 requests from one address, with a limit of 6 per client.
    const codes: number[] = [];
    for (let round = 0; round < 5; round++) {
      for (const token of tokens) codes.push((await heartbeat(token)).statusCode);
    }
    // Screens are known from pairing on, so none of them is held back by the shared address.
    expect(codes.filter((code) => code === 429)).toEqual([]);

    // Invented tokens from another address stay on that address's budget.
    const strangerCodes: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/player/v1/heartbeat',
        remoteAddress: '198.51.100.99',
        headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` },
        payload: {},
      });
      strangerCodes.push(res.statusCode);
    }
    expect(strangerCodes.slice(0, 6).every((code) => code === 401)).toBe(true);
    expect(strangerCodes.slice(6)).toEqual([429, 429]);
  });
});
