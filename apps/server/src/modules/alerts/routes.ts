// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import { ALERT_STYLES } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { AlertsTable } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { notifyScreens } from '../screens/notify.js';
import { activeAlertsQuery } from './active.js';

const MAX_ACTIVE_ALERTS = 20;
const RECENT_ALERTS = 20;

const alertParams = z.object({ orgId: z.uuid(), alertId: z.uuid() });

const startSchema = z.object({
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

type Alert = Selectable<AlertsTable>;

function alertDto(alert: Alert, names: { createdBy: string | null; endedBy: string | null }) {
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
    createdBy: names.createdBy,
    endedBy: names.endedBy,
    createdAt: alert.created_at.toISOString(),
  };
}

export function alertRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };

  /** The screens an alert reaches (all of the organization's when `screenIds` is null). */
  async function targetScreens(orgId: string, screenIds: string[] | null): Promise<string[]> {
    let query = ctx.db.selectFrom('screens').select('id').where('org_id', '=', orgId);
    if (screenIds) query = query.where('id', 'in', screenIds);
    return (await query.execute()).map((row) => row.id);
  }

  async function withNames(rows: Alert[]) {
    const ids = [
      ...new Set(rows.flatMap((row) => [row.created_by, row.ended_by]).filter(Boolean)),
    ] as string[];
    const users =
      ids.length > 0
        ? await ctx.db.selectFrom('users').select(['id', 'name']).where('id', 'in', ids).execute()
        : [];
    const name = (id: string | null) => {
      const user = users.find((u) => u.id === id);
      return user?.name ?? null;
    };
    return rows.map((row) =>
      alertDto(row, { createdBy: name(row.created_by), endedBy: name(row.ended_by) }),
    );
  }

  app.get('/api/v1/orgs/:orgId/alerts', viewer, async (request) => {
    const org = requireOrg(request);
    const active = await activeAlertsQuery(ctx.db, org.id)
      .selectAll()
      .orderBy('starts_at', 'desc')
      .execute();
    const recent = await ctx.db
      .selectFrom('alerts')
      .selectAll()
      .where('org_id', '=', org.id)
      .orderBy('created_at', 'desc')
      .limit(RECENT_ALERTS)
      .execute();
    return { active: await withNames(active), recent: await withNames(recent) };
  });

  app.post('/api/v1/orgs/:orgId/alerts', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(startSchema, request.body);
    const screenIds = body.screenIds ? [...new Set(body.screenIds)] : null;
    const targets = await targetScreens(org.id, screenIds);
    if (screenIds && targets.length !== screenIds.length) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown screens', [
        { path: 'screenIds', reason: 'invalid' },
      ]);
    }
    await ctx.limiter.hit(LIMITS.alertStartOrg, org.id);
    const { count } = await activeAlertsQuery(ctx.db, org.id)
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    if (Number(count) >= MAX_ACTIVE_ALERTS) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many active alerts');
    }
    const alert = await ctx.db
      .insertInto('alerts')
      .values({
        org_id: org.id,
        style: body.style,
        title: body.title,
        message: body.message,
        screen_ids: screenIds,
        ends_at: body.durationMinutes
          ? sql<Date>`now() + make_interval(mins => ${body.durationMinutes})`
          : null,
        created_by: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    // Screens fetch the manifest at once and show the alert before anything else.
    await notifyScreens(ctx, targets);
    await audit(ctx.db, {
      action: 'alert.started',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'alert',
      targetId: alert.id,
      meta: { style: alert.style, screens: screenIds ? screenIds.length : 'all' },
    });
    const [dto] = await withNames([alert]);
    return reply.status(201).send({ alert: dto, screens: targets.length });
  });

  app.post('/api/v1/orgs/:orgId/alerts/:alertId/end', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { alertId } = parse(alertParams, request.params);
    const alert = await ctx.db
      .updateTable('alerts')
      .set({ ended_at: new Date(), ended_by: user.id })
      .where('id', '=', alertId)
      .where('org_id', '=', org.id)
      .where('ended_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!alert) {
      const exists = await ctx.db
        .selectFrom('alerts')
        .select('id')
        .where('id', '=', alertId)
        .where('org_id', '=', org.id)
        .executeTakeFirst();
      if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
      throw new HttpError(409, 'CONFLICT', 'The alert has already ended');
    }
    await notifyScreens(ctx, await targetScreens(org.id, alert.screen_ids));
    await audit(ctx.db, {
      action: 'alert.ended',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'alert',
      targetId: alert.id,
    });
    const [dto] = await withNames([alert]);
    return { alert: dto };
  });
}
