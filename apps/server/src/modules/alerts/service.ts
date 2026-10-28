// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import { ALERT_STYLES } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { AlertsTable } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { emitWebhookEvent } from '../integrations/events.js';
import { notifyScreens } from '../screens/notify.js';
import { activeAlertsQuery } from './active.js';

/**
 * Starting and ending emergency alerts, for the dashboard (a person) and for integrations
 * (an API key, docs/phases/19-integrations-api-webhooks.md).
 */

const MAX_ACTIVE_ALERTS = 20;

export const startAlertSchema = z.object({
  style: z.enum(ALERT_STYLES),
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().max(500).default(''),
  /** Omitted or null: every screen of the organization. */
  screenIds: z.array(z.uuid()).min(1).max(1000).nullable().optional(),
  /** Omitted or null: until ended. */
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .nullable()
    .optional(),
});
export type StartAlertInput = z.infer<typeof startAlertSchema>;

export type Alert = Selectable<AlertsTable>;

/** An alert as the dashboard and the integrations API show it. */
export function alertDto(alert: Alert) {
  const now = Date.now();
  return {
    id: alert.id,
    style: alert.style,
    title: alert.title,
    message: alert.message,
    screenIds: alert.screen_ids,
    startsAt: alert.starts_at.toISOString(),
    endsAt: alert.ends_at?.toISOString() ?? null,
    endedAt: alert.ended_at?.toISOString() ?? null,
    active: alert.ended_at === null && (alert.ends_at === null || alert.ends_at.getTime() > now),
  };
}

/** Who acts: a signed-in person, or an integration's API key. */
export type AlertActor = { userId: string } | { keyId: string; keyName: string };

const actorMeta = (actor: AlertActor) =>
  'keyId' in actor ? { apiKeyId: actor.keyId, apiKey: actor.keyName } : {};

/** The screens an alert reaches (all of the organization's when `screenIds` is null). */
export async function targetScreens(
  ctx: AppContext,
  orgId: string,
  screenIds: string[] | null,
): Promise<string[]> {
  let query = ctx.db.selectFrom('screens').select('id').where('org_id', '=', orgId);
  if (screenIds) query = query.where('id', 'in', screenIds);
  return (await query.execute()).map((row) => row.id);
}

export async function startAlert(
  ctx: AppContext,
  orgId: string,
  body: StartAlertInput,
  actor: AlertActor,
): Promise<{ alert: Alert; screens: number }> {
  const screenIds = body.screenIds ? [...new Set(body.screenIds)] : null;
  const targets = await targetScreens(ctx, orgId, screenIds);
  if (screenIds && targets.length !== screenIds.length) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown screens', [
      { path: 'screenIds', reason: 'invalid' },
    ]);
  }
  await ctx.limiter.hit(LIMITS.alertStartOrg, orgId);
  const { count } = await activeAlertsQuery(ctx.db, orgId)
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow();
  if (Number(count) >= MAX_ACTIVE_ALERTS) {
    throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many active alerts');
  }
  const alert = await ctx.db
    .insertInto('alerts')
    .values({
      org_id: orgId,
      style: body.style,
      title: body.title,
      message: body.message,
      screen_ids: screenIds,
      ends_at: body.durationMinutes
        ? sql<Date>`now() + make_interval(mins => ${body.durationMinutes})`
        : null,
      created_by: 'userId' in actor ? actor.userId : null,
      created_by_key: 'keyId' in actor ? actor.keyId : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  // Screens fetch the manifest at once and show the alert before anything else.
  await notifyScreens(ctx, targets);
  await audit(ctx.db, {
    action: 'alert.started',
    orgId,
    actorUserId: 'userId' in actor ? actor.userId : null,
    targetType: 'alert',
    targetId: alert.id,
    meta: {
      style: alert.style,
      screens: screenIds ? screenIds.length : 'all',
      ...actorMeta(actor),
    },
  });
  await emitWebhookEvent(ctx, orgId, 'alert.started', {
    alert: {
      id: alert.id,
      style: alert.style,
      title: alert.title,
      screens: screenIds ? screenIds.length : 'all',
      endsAt: alert.ends_at?.toISOString() ?? null,
    },
  });
  return { alert, screens: targets.length };
}

export async function endAlert(
  ctx: AppContext,
  orgId: string,
  alertId: string,
  actor: AlertActor,
): Promise<Alert> {
  const alert = await ctx.db
    .updateTable('alerts')
    .set({
      ended_at: new Date(),
      ended_by: 'userId' in actor ? actor.userId : null,
      ended_by_key: 'keyId' in actor ? actor.keyId : null,
      ended_event_at: new Date(),
    })
    .where('id', '=', alertId)
    .where('org_id', '=', orgId)
    .where('ended_at', 'is', null)
    .returningAll()
    .executeTakeFirst();
  if (!alert) {
    const exists = await ctx.db
      .selectFrom('alerts')
      .select('id')
      .where('id', '=', alertId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    throw new HttpError(409, 'CONFLICT', 'The alert has already ended');
  }
  await notifyScreens(ctx, await targetScreens(ctx, orgId, alert.screen_ids));
  await audit(ctx.db, {
    action: 'alert.ended',
    orgId,
    actorUserId: 'userId' in actor ? actor.userId : null,
    targetType: 'alert',
    targetId: alert.id,
    meta: actorMeta(actor),
  });
  await emitWebhookEvent(ctx, orgId, 'alert.ended', {
    alert: { id: alert.id, style: alert.style, title: alert.title },
  });
  return alert;
}

/**
 * "alert.ended" for alerts that ended on their own (their duration passed). Each is claimed
 * once (ended_event_at), so several servers report it once. Runs with the webhook dispatcher.
 */
export async function reportExpiredAlerts(ctx: Pick<AppContext, 'db'>): Promise<number> {
  const expired = await ctx.db
    .updateTable('alerts')
    .set({ ended_event_at: new Date() })
    .where('ended_event_at', 'is', null)
    .where('ended_at', 'is', null)
    .where('ends_at', '<=', new Date())
    .returning(['id', 'org_id', 'style', 'title'])
    .execute();
  for (const alert of expired) {
    await emitWebhookEvent(ctx, alert.org_id, 'alert.ended', {
      alert: { id: alert.id, style: alert.style, title: alert.title, expired: true },
    });
  }
  return expired.length;
}
