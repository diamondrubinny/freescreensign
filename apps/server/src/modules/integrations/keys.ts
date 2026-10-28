// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import {
  API_KEY_PREFIX,
  INTEGRATION_LIMITS,
  apiKeyInputSchema,
  type ApiKeyScope,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { ApiKeysTable } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { beginTenantTransaction } from '../../lib/tenant.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { clientIp } from '../auth/sessions.js';

/**
 * Organization API keys (docs/phases/19-integrations-api-webhooks.md): made by admins, shown
 * once, stored as a SHA-256 hash (a random 256-bit key needs no slow hash), limited to the
 * scopes they were given.
 */

const KEY_PATTERN = new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{43}$`);
/** How many characters identify a key in lists: "rbk_" and 8 more. */
const PREFIX_LENGTH = API_KEY_PREFIX.length + 8;
const DAY_MS = 24 * 60 * 60 * 1000;

type ApiKey = Selectable<ApiKeysTable>;

export interface ApiKeyAccess {
  keyId: string;
  keyName: string;
  orgId: string;
  requireApproval: boolean;
}

/** A new key: the secret (shown once) and what is stored. */
export function generateApiKey(): { token: string; prefix: string; hash: string } {
  const token = `${API_KEY_PREFIX}${randomToken(32)}`;
  return { token, prefix: token.slice(0, PREFIX_LENGTH), hash: sha256Hex(token) };
}

/** The address kept with "last used": /24 for IPv4, /48 for IPv6 (not the full address). */
export function shortenIp(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1] ?? ''}.${v4[2] ?? ''}.${v4[3] ?? ''}.0/24`;
  if (ip.includes(':')) {
    const groups = ip.split(':').slice(0, 3);
    return `${groups.join(':')}::/48`;
  }
  return 'unknown';
}

const unauthorized = () =>
  new HttpError(401, 'UNAUTHORIZED', 'Invalid, expired or revoked API key');

/**
 * Authenticates an integration request ("Authorization: Bearer rbk_…") and checks the scope.
 * Then the request runs in the key's organization (row-level security), like the dashboard.
 */
export async function requireApiKey(
  ctx: AppContext,
  request: FastifyRequest,
  scope: ApiKeyScope,
): Promise<ApiKeyAccess> {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const ip = clientIp(request);
  const row = KEY_PATTERN.test(token)
    ? await ctx.db
        .selectFrom('api_keys')
        .innerJoin('organizations', 'organizations.id', 'api_keys.org_id')
        .select([
          'api_keys.id',
          'api_keys.name',
          'api_keys.org_id',
          'api_keys.scopes',
          'api_keys.expires_at',
          'api_keys.revoked_at',
          'api_keys.last_used_at',
          'organizations.require_approval',
        ])
        .where('api_keys.token_hash', '=', sha256Hex(token))
        .where('organizations.deleted_at', 'is', null)
        .executeTakeFirst()
    : undefined;
  const now = Date.now();
  if (
    !row ||
    row.revoked_at !== null ||
    (row.expires_at !== null && row.expires_at.getTime() <= now)
  ) {
    // Counted per address: guessing is hopeless (256 bits), but each try costs a lookup.
    await ctx.limiter.hit(LIMITS.apiKeyFailIp, ctx.keys.hashIp(ip));
    throw unauthorized();
  }
  await ctx.limiter.hit(LIMITS.apiKeyRequests, row.id);
  if (!row.scopes.includes(scope)) {
    throw new HttpError(403, 'FORBIDDEN', `This API key does not have the "${scope}" scope`);
  }
  // "Last used", written at most once a minute (not on every request).
  if (row.last_used_at === null || now - row.last_used_at.getTime() > 60_000) {
    await ctx.db
      .updateTable('api_keys')
      .set({ last_used_at: new Date(now), last_used_ip: shortenIp(ip) })
      .where('id', '=', row.id)
      .execute();
  }
  await beginTenantTransaction(ctx.db, ctx.rls === true, row.org_id);
  return {
    keyId: row.id,
    keyName: row.name,
    orgId: row.org_id,
    requireApproval: row.require_approval,
  };
}

function keyDto(key: ApiKey) {
  const now = Date.now();
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    createdAt: key.created_at.toISOString(),
    expiresAt: key.expires_at?.toISOString() ?? null,
    lastUsedAt: key.last_used_at?.toISOString() ?? null,
    lastUsedIp: key.last_used_ip,
    revokedAt: key.revoked_at?.toISOString() ?? null,
    active: key.revoked_at === null && (key.expires_at === null || key.expires_at.getTime() > now),
  };
}

export function apiKeyRoutes(app: FastifyInstance, ctx: AppContext) {
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };
  const keyParams = z.object({ orgId: z.uuid(), keyId: z.uuid() });

  app.get('/api/v1/orgs/:orgId/api-keys', admin, async (request) => {
    const org = requireOrg(request);
    const keys = await ctx.db
      .selectFrom('api_keys')
      .selectAll()
      .where('org_id', '=', org.id)
      .orderBy('created_at', 'desc')
      .execute();
    return { keys: keys.map(keyDto) };
  });

  app.post('/api/v1/orgs/:orgId/api-keys', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(apiKeyInputSchema, request.body);
    const { count } = await ctx.db
      .selectFrom('api_keys')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .where('revoked_at', 'is', null)
      .executeTakeFirstOrThrow();
    if (Number(count) >= INTEGRATION_LIMITS.maxKeysPerOrg) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many API keys');
    }
    const { token, prefix, hash } = generateApiKey();
    const key = await ctx.db
      .insertInto('api_keys')
      .values({
        org_id: org.id,
        name: body.name,
        prefix,
        token_hash: hash,
        scopes: body.scopes,
        created_by: user.id,
        expires_at: body.expiresInDays ? new Date(Date.now() + body.expiresInDays * DAY_MS) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'api_key.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'api_key',
      targetId: key.id,
      meta: { name: key.name, scopes: key.scopes },
    });
    // The only time the key is shown.
    return reply.status(201).send({ key: keyDto(key), token });
  });

  /** Revokes a key: it stops working at once (kept in the list, for the record). */
  app.delete('/api/v1/orgs/:orgId/api-keys/:keyId', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { keyId } = parse(keyParams, request.params);
    const key = await ctx.db
      .updateTable('api_keys')
      .set({ revoked_at: new Date() })
      .where('id', '=', keyId)
      .where('org_id', '=', org.id)
      .where('revoked_at', 'is', null)
      .returning(['id', 'name'])
      .executeTakeFirst();
    if (!key) {
      const exists = await ctx.db
        .selectFrom('api_keys')
        .select('id')
        .where('id', '=', keyId)
        .where('org_id', '=', org.id)
        .executeTakeFirst();
      if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
      return reply.status(204).send();
    }
    await audit(ctx.db, {
      action: 'api_key.revoked',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'api_key',
      targetId: key.id,
      meta: { name: key.name },
    });
    return reply.status(204).send();
  });
}
