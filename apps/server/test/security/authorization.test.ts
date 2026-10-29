// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '@rubinny/shared';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';
import { OPTIONAL_ROUTES, ROUTE_POLICY, type RoutePolicy } from './route-policy.js';

type Method = Parameters<Client['request']>[0];

/** The role just below another: a member with it must be refused (403). */
const BELOW: Partial<Record<Role, Role>> = { EDITOR: 'VIEWER', ADMIN: 'EDITOR', OWNER: 'ADMIN' };

/** Path parameters: random ids, so only the access check can answer. */
const PARAMS: Record<string, string> = {
  kitId: 'lobby',
  imageId: 'openverse-0000',
};
const fill = (url: string, orgId: string) =>
  url.replace(/:([A-Za-z]+)/g, (_, name: string) =>
    name === 'orgId' ? orgId : (PARAMS[name] ?? crypto.randomUUID()),
  );

/** A body for methods that take one (a plausible empty one; access is checked first). */
const bodyFor = (method: string) => (method === 'GET' || method === 'DELETE' ? undefined : {});

let ipCounter = 0;
/** A fresh address per call, so per-IP limits of failed attempts never answer instead. */
const freshIp = () => `198.51.100.${String((ipCounter++ % 250) + 1)}`;

/**
 * docs/phases/21-security-review.md (S2, S3): every route the server registers has an access
 * policy (test/security/route-policy.ts), and the server enforces it: 401 without credentials,
 * 403 below the required role, 404 for another organization, a device or an API key.
 */
describe.runIf(integrationEnabled)('access policy of every route', () => {
  let h: Harness;
  let orgId: string;
  let otherOrgId: string;
  const members: Partial<Record<Role, Client>> = {};
  let outsider: Client;
  /** API keys of this organization, by the one scope each has. */
  const keys: Record<string, string> = {};

  beforeAll(async () => {
    h = await createHarness();
    await h.app.ready();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'owner@org.example'), 'Org', false);
    otherOrgId = await insertOrg(
      h.db,
      await insertUser(h.db, 'outsider@other.example'),
      'Other',
      false,
    );
    for (const role of ['VIEWER', 'EDITOR', 'ADMIN'] as const) {
      const id = await insertUser(h.db, `${role.toLowerCase()}@org.example`);
      await h.db.insertInto('memberships').values({ org_id: orgId, user_id: id, role }).execute();
      members[role] = await login(h.app, `${role.toLowerCase()}@org.example`);
    }
    members.OWNER = await login(h.app, 'owner@org.example');
    outsider = await login(h.app, 'outsider@other.example');
    for (const scope of ['screens:read', 'alerts:write', 'widgets:write']) {
      const res = await members.OWNER.post(`/api/v1/orgs/${orgId}/api-keys`, {
        name: scope,
        scopes: [scope],
      });
      expect(res.statusCode, res.body).toBe(201);
      keys[scope] = res.json<{ token: string }>().token;
    }
  });
  afterAll(async () => {
    await h.close();
  });

  const registered = () =>
    h.routes
      // HEAD routes share the GET handlers.
      .filter((route) => route.method !== 'HEAD')
      .map((route) => ({ ...route, key: `${route.method} ${route.url}` }));

  it('has a policy for every route, and the organization guards ask for the listed role', () => {
    const routes = registered();
    expect(routes.length).toBeGreaterThan(120);
    const missing = routes.filter((route) => !(route.key in ROUTE_POLICY)).map((r) => r.key);
    expect(missing, 'routes without an access policy (test/security/route-policy.ts)').toEqual([]);
    const keysNow = new Set(routes.map((route) => route.key));
    const stale = Object.keys(ROUTE_POLICY).filter(
      (key) => !keysNow.has(key) && !OPTIONAL_ROUTES.has(key),
    );
    expect(stale, 'policies for routes that no longer exist').toEqual([]);
    const wrongRole = routes.flatMap((route) => {
      const policy = ROUTE_POLICY[route.key];
      const listed = policy && 'org' in policy ? policy.org : null;
      return listed === route.orgRole
        ? []
        : [`${route.key}: guard ${String(route.orgRole)}, policy ${String(listed)}`];
    });
    expect(wrongRole).toEqual([]);
  });

  const routesWith = <K extends string>(kind: K) =>
    registered().flatMap((route) => {
      const policy = ROUTE_POLICY[route.key];
      return policy && kind in policy
        ? [{ ...route, policy: policy as Extract<RoutePolicy, Record<K, unknown>> }]
        : [];
    });

  it('organization routes: 401 signed out, 404 for other organizations, 403 below the role', async () => {
    const wrong: string[] = [];
    let below403 = 0;
    for (const route of routesWith('org')) {
      const method = route.method as Method;
      const expect_ = (who: string, status: number, actual: number, body: string) => {
        if (actual !== status) wrong.push(`${route.key} ${who}: ${String(actual)} ${body}`);
      };
      const anonymous = new Client(h.app, freshIp());
      let res = await anonymous.request(method, fill(route.url, orgId), bodyFor(route.method));
      expect_('signed out', 401, res.statusCode, res.body);
      // Another organization's member, at this organization and at an unknown one.
      res = await outsider.request(method, fill(route.url, orgId), bodyFor(route.method));
      expect_('outsider', 404, res.statusCode, res.body);
      res = await outsider.request(
        method,
        fill(route.url, crypto.randomUUID()),
        bodyFor(route.method),
      );
      expect_('unknown organization', 404, res.statusCode, res.body);
      const below = BELOW[route.policy.org];
      if (below) {
        res = await members[below]!.request(method, fill(route.url, orgId), bodyFor(route.method));
        expect_(below, 403, res.statusCode, res.body);
        below403++;
      }
    }
    expect(wrong).toEqual([]);
    // Every route above VIEWER was also tried one role below.
    expect(below403).toBe(
      routesWith('org').filter((route) => route.policy.org !== 'VIEWER').length,
    );
    expect(below403).toBeGreaterThan(50);
  });

  it('signed-in routes answer 401 without a session', async () => {
    const wrong: string[] = [];
    for (const route of routesWith('session')) {
      const res = await new Client(h.app, freshIp()).request(
        route.method as Method,
        fill(route.url, orgId),
        bodyFor(route.method),
      );
      if (res.statusCode !== 401) wrong.push(`${route.key}: ${String(res.statusCode)} ${res.body}`);
    }
    expect(wrong).toEqual([]);
  });

  it('screen routes answer 401 without a device token, or with a wrong one', async () => {
    const wrong: string[] = [];
    for (const route of routesWith('device')) {
      if (route.url === '/player/v1/ws') continue; // a WebSocket: test/api/live.test.ts
      for (const authorization of [
        undefined,
        'Bearer not-a-device-token',
        `Bearer ${keys['screens:read']!}`,
      ]) {
        const res = await h.app.inject({
          method: route.method as Method,
          url: fill(route.url, orgId),
          remoteAddress: freshIp(),
          headers: authorization ? { authorization } : {},
          ...(route.method === 'GET' ? {} : { payload: {} }),
        });
        if (res.statusCode !== 401) {
          wrong.push(
            `${route.key} (${authorization ?? 'none'}): ${String(res.statusCode)} ${res.body}`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('integration routes: 401 without a valid key, 403 with a key of another scope', async () => {
    const wrong: string[] = [];
    for (const route of routesWith('apiKey')) {
      const call = (authorization?: string) =>
        h.app.inject({
          method: route.method as Method,
          url: fill(route.url, orgId),
          remoteAddress: freshIp(),
          headers: authorization ? { authorization } : {},
          ...(route.method === 'GET' ? {} : { payload: {} }),
        });
      for (const authorization of [undefined, 'Bearer rbk_not_a_real_key', 'Basic x']) {
        const res = await call(authorization);
        if (res.statusCode !== 401) {
          wrong.push(`${route.key} (${authorization ?? 'none'}): ${String(res.statusCode)}`);
        }
      }
      for (const [scope, token] of Object.entries(keys)) {
        if (scope === route.policy.apiKey) continue;
        const res = await call(`Bearer ${token}`);
        if (res.statusCode !== 403)
          wrong.push(`${route.key} (${scope}): ${String(res.statusCode)}`);
      }
      // A user's session is not an API key.
      const res = await members.OWNER!.request(
        route.method as Method,
        fill(route.url, orgId),
        bodyFor(route.method),
      );
      if (res.statusCode !== 401) wrong.push(`${route.key} (session): ${String(res.statusCode)}`);
    }
    expect(wrong).toEqual([]);
  });

  it('the operator page is hidden from everyone else (404), including owners', async () => {
    for (const route of routesWith('operator')) {
      const anonymous = await new Client(h.app, freshIp()).request(
        route.method as Method,
        route.url,
      );
      expect(anonymous.statusCode).toBe(401);
      const owner = await members.OWNER!.request(route.method as Method, route.url);
      expect(owner.statusCode).toBe(404);
    }
    expect(otherOrgId).toBeDefined();
  });

  it('public routes say why they are public, and never fail on an empty request', async () => {
    const failing: string[] = [];
    for (const route of routesWith('public')) {
      expect(route.policy.public.length).toBeGreaterThan(10);
      if (route.url.includes('oidc')) continue;
      const res = await new Client(h.app, freshIp()).request(
        route.method as Method,
        fill(route.url, orgId),
        bodyFor(route.method),
      );
      if (res.statusCode >= 500) failing.push(`${route.key}: ${String(res.statusCode)}`);
    }
    expect(failing).toEqual([]);
  });
});
