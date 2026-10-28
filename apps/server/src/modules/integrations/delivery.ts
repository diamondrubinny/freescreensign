// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { DEFAULT_LOCALE, INTEGRATION_LIMITS, isSupportedLocale } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { SafeFetchError, safeFetch } from '../../lib/safe-fetch.js';
import { onWebhookWake } from './events.js';

/**
 * Webhook deliveries (docs/phases/19-integrations-api-webhooks.md). The table is the queue:
 * due deliveries are claimed atomically (so several servers never send one twice), signed
 * with the webhook's secret and POSTed through the SSRF-safe client. Failures are retried
 * later; a webhook that keeps failing is turned off and its admins are told.
 */

/** Waits after the 1st, 2nd… failed attempt; after the last one the delivery has failed. */
export const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 3600, 6 * 3600, 12 * 3600];
/** Consecutive failed deliveries that turn a webhook off. */
export const DISABLE_AFTER_FAILURES = 20;
const BATCH = 20;
const CLAIM_SECONDS = 60;
const TICK_MS = 5_000;
export const USER_AGENT =
  'Rubinny-Webhooks/1.0 (+https://github.com/diamondrubinny/freescreensign)';

type Deps = Pick<AppContext, 'db' | 'keys' | 'mailer' | 'env'>;

export const secretAad = (webhookId: string) => `webhook-secret:${webhookId}`;

/**
 * `Rubinny-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. Receivers
 * check the HMAC with the secret and refuse a `t` older than a few minutes (replays).
 */
export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex');
  return `t=${String(timestamp)},v1=${mac}`;
}

/** Sends one request; returns the status code, or throws with a short reason. */
export async function postWebhook(
  deps: Pick<Deps, 'env'>,
  url: string,
  secret: string,
  event: string,
  deliveryId: string,
  body: string,
): Promise<number> {
  const response = await safeFetch(url, {
    method: 'POST',
    body,
    discardBody: true,
    timeoutMs: 10_000,
    allowPrivate: deps.env.WIDGET_FETCH_ALLOW_PRIVATE,
    headers: {
      'user-agent': USER_AGENT,
      'content-type': 'application/json',
      'rubinny-event': event,
      'rubinny-delivery': deliveryId,
      'rubinny-signature': signPayload(secret, body, Math.floor(Date.now() / 1000)),
    },
  });
  return response.status;
}

const failureText = (error: unknown) =>
  error instanceof SafeFetchError ? error.message.slice(0, 200) : 'Request failed';

async function tellAdmins(deps: Deps, orgId: string, name: string): Promise<void> {
  const admins = await deps.db
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .innerJoin('organizations', 'organizations.id', 'memberships.org_id')
    .select(['users.email', 'users.locale', 'organizations.name as orgName'])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.role', 'in', ['OWNER', 'ADMIN'])
    .where('users.email_verified_at', 'is not', null)
    .execute();
  const url = `${new URL(deps.env.PUBLIC_URL).origin}/orgs/${orgId}/integrations`;
  for (const admin of admins) {
    await deps.mailer.send(
      admin.email,
      isSupportedLocale(admin.locale) ? admin.locale : DEFAULT_LOCALE,
      { kind: 'webhook-disabled', orgName: admin.orgName, webhook: name, url },
    );
  }
}

/** Claims and sends the due deliveries once. Returns how many were attempted. */
export async function runWebhookDeliveries(deps: Deps): Promise<number> {
  const claimed = await sql<{
    id: string;
    org_id: string;
    webhook_id: string;
    event: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>`
    UPDATE webhook_deliveries
    SET claimed_until = now() + make_interval(secs => ${CLAIM_SECONDS})
    WHERE id IN (
      SELECT id FROM webhook_deliveries
      WHERE status = 'pending' AND next_attempt_at <= now()
        AND (claimed_until IS NULL OR claimed_until < now())
      ORDER BY next_attempt_at
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, org_id, webhook_id, event, payload, attempts
  `.execute(deps.db);

  for (const delivery of claimed.rows) {
    const hook = await deps.db
      .selectFrom('webhooks')
      .select(['id', 'name', 'url', 'secret_enc', 'enabled', 'failure_count'])
      .where('id', '=', delivery.webhook_id)
      .executeTakeFirst();
    if (!hook?.enabled) {
      await deps.db
        .updateTable('webhook_deliveries')
        .set({ status: 'failed', last_error: 'The webhook is off', claimed_until: null })
        .where('id', '=', delivery.id)
        .execute();
      continue;
    }
    const attempts = delivery.attempts + 1;
    const body = JSON.stringify(delivery.payload);
    let status: number | null = null;
    let error: string | null = null;
    try {
      const secret = deps.keys.decrypt(hook.secret_enc, secretAad(hook.id));
      status = await postWebhook(deps, hook.url, secret, delivery.event, delivery.id, body);
    } catch (caught) {
      error = failureText(caught);
      if (caught instanceof SafeFetchError && caught.status !== undefined) status = caught.status;
    }

    if (error === null) {
      await deps.db
        .updateTable('webhook_deliveries')
        .set({
          status: 'delivered',
          attempts,
          last_status_code: status,
          last_error: null,
          claimed_until: null,
          delivered_at: new Date(),
        })
        .where('id', '=', delivery.id)
        .execute();
      if (hook.failure_count > 0) {
        await deps.db
          .updateTable('webhooks')
          .set({ failure_count: 0 })
          .where('id', '=', hook.id)
          .execute();
      }
      continue;
    }

    const delay = RETRY_DELAYS_SECONDS[attempts - 1];
    await deps.db
      .updateTable('webhook_deliveries')
      .set({
        status: delay === undefined ? 'failed' : 'pending',
        attempts,
        last_status_code: status,
        last_error: error,
        claimed_until: null,
        next_attempt_at: new Date(Date.now() + (delay ?? 0) * 1000),
      })
      .where('id', '=', delivery.id)
      .execute();
    // Counted per attempt, so an address that is gone is turned off within hours.
    const failures = await deps.db
      .updateTable('webhooks')
      .set((eb) => ({ failure_count: eb('failure_count', '+', 1) }))
      .where('id', '=', hook.id)
      .returning(['failure_count', 'enabled'])
      .executeTakeFirst();
    if (failures && failures.failure_count >= DISABLE_AFTER_FAILURES) {
      const off = await deps.db
        .updateTable('webhooks')
        .set({ enabled: false, disabled_reason: 'failures', updated_at: new Date() })
        .where('id', '=', hook.id)
        .where('enabled', '=', true)
        .returning('id')
        .executeTakeFirst();
      if (off) {
        await audit(deps.db, {
          action: 'webhook.disabled',
          orgId: delivery.org_id,
          targetType: 'webhook',
          targetId: hook.id,
          meta: { reason: 'failures', failures: failures.failure_count },
        });
        await tellAdmins(deps, delivery.org_id, hook.name);
      }
    }
  }
  return claimed.rows.length;
}

/** Old deliveries (sent or not) are removed (daily maintenance). */
export async function pruneWebhookDeliveries(db: Deps['db']): Promise<number> {
  const result = await db
    .deleteFrom('webhook_deliveries')
    .where(
      'created_at',
      '<',
      new Date(Date.now() - INTEGRATION_LIMITS.deliveryRetentionDays * 24 * 3600 * 1000),
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** Sends due deliveries every few seconds, and at once when an event is queued. */
export function startWebhookDispatcher(app: FastifyInstance, ctx: AppContext): void {
  const deps = { db: ctx.db, keys: ctx.keys, mailer: ctx.mailer, env: ctx.env };
  let running = false;
  let again = false;
  const run = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    runWebhookDeliveries(deps)
      .catch((err: unknown) => {
        app.log.error({ err }, 'webhook delivery failed');
      })
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          run();
        }
      });
  };
  const timer = setInterval(run, TICK_MS);
  timer.unref();
  onWebhookWake(run);
  app.addHook('onClose', () => {
    clearInterval(timer);
    onWebhookWake(null);
  });
}
