// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { activeAlertsQuery } from './active.js';
import { alertDto, endAlert, startAlert, startAlertSchema, type Alert } from './service.js';

const RECENT_ALERTS = 20;

const alertParams = z.object({ orgId: z.uuid(), alertId: z.uuid() });

/** `names`: a person's name, or "API: <key name>" for an integration. */
function alertWithNames(alert: Alert, names: { createdBy: string | null; endedBy: string | null }) {
  return {
    ...alertDto(alert),
    createdBy: names.createdBy,
    endedBy: names.endedBy,
    createdAt: alert.created_at.toISOString(),
  };
}

export function alertRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };

  async function withNames(rows: Alert[]) {
    const ids = [
      ...new Set(rows.flatMap((row) => [row.created_by, row.ended_by]).filter(Boolean)),
    ] as string[];
    const keyIds = [
      ...new Set(rows.flatMap((row) => [row.created_by_key, row.ended_by_key]).filter(Boolean)),
    ] as string[];
    const [users, keys] = await Promise.all([
      ids.length > 0
        ? ctx.db.selectFrom('users').select(['id', 'name']).where('id', 'in', ids).execute()
        : [],
      keyIds.length > 0
        ? ctx.db.selectFrom('api_keys').select(['id', 'name']).where('id', 'in', keyIds).execute()
        : [],
    ]);
    const name = (id: string | null, keyId: string | null) => {
      if (keyId) {
        const key = keys.find((k) => k.id === keyId);
        return key ? `API: ${key.name}` : 'API';
      }
      return users.find((u) => u.id === id)?.name ?? null;
    };
    return rows.map((row) =>
      alertWithNames(row, {
        createdBy: name(row.created_by, row.created_by_key),
        endedBy: name(row.ended_by, row.ended_by_key),
      }),
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
    const body = parse(startAlertSchema, request.body);
    const { alert, screens } = await startAlert(ctx, org.id, body, { userId: user.id });
    const [dto] = await withNames([alert]);
    return reply.status(201).send({ alert: dto, screens });
  });

  app.post('/api/v1/orgs/:orgId/alerts/:alertId/end', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { alertId } = parse(alertParams, request.params);
    const alert = await endAlert(ctx, org.id, alertId, { userId: user.id });
    const [dto] = await withNames([alert]);
    return { alert: dto };
  });
}
