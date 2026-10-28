// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import {
  INTEGRATION_LIMITS,
  WEBHOOK_EVENTS,
  webhookInputSchema,
  webhookUrlSchema,
  type WebhookPayload,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { WebhooksTable } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { randomToken } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { SafeFetchError } from '../../lib/safe-fetch.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { postWebhook, secretAad } from './delivery.js';

/** Webhooks of an organization (admins): addresses, events, secrets, recent deliveries. */

type Webhook = Selectable<WebhooksTable>;
const RECENT_DELIVERIES = 10;

/** A new signing secret ("whsec_…"), shown once. */
const newSecret = () => `whsec_${randomToken(32)}`;

function webhookDto(hook: Webhook) {
  return {
    id: hook.id,
    name: hook.name,
    url: hook.url,
    events: hook.events,
    enabled: hook.enabled,
    disabledReason: hook.disabled_reason,
    failureCount: hook.failure_count,
    createdAt: hook.created_at.toISOString(),
  };
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    url: webhookUrlSchema.optional(),
    events: z
      .array(z.enum(WEBHOOK_EVENTS))
      .min(1)
      .max(WEBHOOK_EVENTS.length)
      .transform((events) => [...new Set(events)])
      .optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export function webhookRoutes(app: FastifyInstance, ctx: AppContext) {
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };
  const hookParams = z.object({ orgId: z.uuid(), webhookId: z.uuid() });

  async function loadWebhook(orgId: string, webhookId: string): Promise<Webhook> {
    const hook = await ctx.db
      .selectFrom('webhooks')
      .selectAll()
      .where('id', '=', webhookId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!hook) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    return hook;
  }

  app.get('/api/v1/orgs/:orgId/webhooks', admin, async (request) => {
    const org = requireOrg(request);
    const hooks = await ctx.db
      .selectFrom('webhooks')
      .selectAll()
      .where('org_id', '=', org.id)
      .orderBy('created_at')
      .execute();
    return { webhooks: hooks.map(webhookDto) };
  });

  app.post('/api/v1/orgs/:orgId/webhooks', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(webhookInputSchema, request.body);
    const { count } = await ctx.db
      .selectFrom('webhooks')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= INTEGRATION_LIMITS.maxWebhooksPerOrg) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many webhooks');
    }
    // The id is chosen here: the secret is encrypted bound to it.
    const id = randomUUID();
    const secret = newSecret();
    const hook = await ctx.db
      .insertInto('webhooks')
      .values({
        id,
        org_id: org.id,
        name: body.name,
        url: body.url,
        events: body.events,
        enabled: body.enabled,
        secret_enc: ctx.keys.encrypt(secret, secretAad(id)),
        created_by: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'webhook.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'webhook',
      targetId: hook.id,
      meta: { name: hook.name, host: new URL(hook.url).host, events: hook.events },
    });
    // The only time the secret is shown.
    return reply.status(201).send({ webhook: webhookDto(hook), secret });
  });

  app.patch('/api/v1/orgs/:orgId/webhooks/:webhookId', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { webhookId } = parse(hookParams, request.params);
    const body = parse(patchSchema, request.body);
    await loadWebhook(org.id, webhookId);
    const hook = await ctx.db
      .updateTable('webhooks')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.events !== undefined ? { events: body.events } : {}),
        // Turning it on again starts over (no leftover failures, no reason).
        ...(body.enabled !== undefined
          ? body.enabled
            ? { enabled: true, failure_count: 0, disabled_reason: null }
            : { enabled: false, disabled_reason: 'manual' }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', webhookId)
      .where('org_id', '=', org.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'webhook.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'webhook',
      targetId: hook.id,
      meta: { fields: Object.keys(body) },
    });
    return { webhook: webhookDto(hook) };
  });

  /** A new signing secret (the old one stops working at once). */
  app.post('/api/v1/orgs/:orgId/webhooks/:webhookId/secret', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { webhookId } = parse(hookParams, request.params);
    await loadWebhook(org.id, webhookId);
    const secret = newSecret();
    await ctx.db
      .updateTable('webhooks')
      .set({ secret_enc: ctx.keys.encrypt(secret, secretAad(webhookId)), updated_at: new Date() })
      .where('id', '=', webhookId)
      .where('org_id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'webhook.secret_rotated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'webhook',
      targetId: webhookId,
    });
    return { secret };
  });

  app.delete('/api/v1/orgs/:orgId/webhooks/:webhookId', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { webhookId } = parse(hookParams, request.params);
    const hook = await loadWebhook(org.id, webhookId);
    await ctx.db
      .deleteFrom('webhooks')
      .where('id', '=', webhookId)
      .where('org_id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'webhook.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'webhook',
      targetId: webhookId,
      meta: { name: hook.name },
    });
    return reply.status(204).send();
  });

  /** Sends a "ping" now and reports what the receiver answered (not queued, not retried). */
  app.post('/api/v1/orgs/:orgId/webhooks/:webhookId/test', admin, async (request) => {
    const org = requireOrg(request);
    const { webhookId } = parse(hookParams, request.params);
    const hook = await loadWebhook(org.id, webhookId);
    await ctx.limiter.hit(LIMITS.webhookTestOrg, org.id);
    const payload: WebhookPayload<'ping'> = {
      id: randomUUID(),
      event: 'ping',
      createdAt: new Date().toISOString(),
      organization: { id: org.id },
      data: { webhook: { id: hook.id, name: hook.name } },
    };
    const secret = ctx.keys.decrypt(hook.secret_enc, secretAad(hook.id));
    try {
      const status = await postWebhook(
        ctx,
        hook.url,
        secret,
        'ping',
        payload.id,
        JSON.stringify(payload),
      );
      return { ok: true, status, error: null };
    } catch (error) {
      return {
        ok: false,
        status: error instanceof SafeFetchError ? (error.status ?? null) : null,
        error: error instanceof SafeFetchError ? error.reason : 'network',
      };
    }
  });

  app.get('/api/v1/orgs/:orgId/webhooks/:webhookId/deliveries', admin, async (request) => {
    const org = requireOrg(request);
    const { webhookId } = parse(hookParams, request.params);
    await loadWebhook(org.id, webhookId);
    const rows = await ctx.db
      .selectFrom('webhook_deliveries')
      .select([
        'id',
        'event',
        'status',
        'attempts',
        'last_status_code',
        'last_error',
        'created_at',
        'delivered_at',
        'next_attempt_at',
      ])
      .where('webhook_id', '=', webhookId)
      .where('org_id', '=', org.id)
      .orderBy('created_at', 'desc')
      .limit(RECENT_DELIVERIES)
      .execute();
    return {
      deliveries: rows.map((row) => ({
        id: row.id,
        event: row.event,
        status: row.status,
        attempts: row.attempts,
        statusCode: row.last_status_code,
        error: row.last_error,
        createdAt: row.created_at.toISOString(),
        deliveredAt: row.delivered_at?.toISOString() ?? null,
        nextAttemptAt: row.status === 'pending' ? row.next_attempt_at.toISOString() : null,
      })),
    };
  });
}
