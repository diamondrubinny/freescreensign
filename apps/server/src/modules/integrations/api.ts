// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseWidgetConfig } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { activeAlertsQuery } from '../alerts/active.js';
import { alertDto, endAlert, startAlert, startAlertSchema } from '../alerts/service.js';
import { notifyPlaylistScreens, widgetPlaylists } from '../screens/notify.js';
import { ONLINE_WINDOW_MS } from '../screens/routes.js';
import { requireApiKey } from './keys.js';

/**
 * The integrations API (docs/phases/19-integrations-api-webhooks.md, docs/INTEGRATIONS.md):
 * "Authorization: Bearer rbk_…", one scope per endpoint, the key's organization only.
 */

const BASE = '/api/integrations/v1';

/** Widgets whose content an integration may change, and the fields it may change. */
const WRITABLE_WIDGETS = {
  text: ['text', 'title'],
  ticker: ['text', 'label'],
} as const;

const widgetPatchSchema = z
  .object({
    text: z.string().max(1000).optional(),
    title: z.string().max(200).nullable().optional(),
    label: z.string().max(40).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export function integrationApiRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get(`${BASE}/screens`, async (request) => {
    const key = await requireApiKey(ctx, request, 'screens:read');
    const screens = await ctx.db
      .selectFrom('screens')
      .select(['id', 'name', 'last_seen_at', 'player_version', 'platform'])
      .where('org_id', '=', key.orgId)
      .orderBy('name')
      .execute();
    const now = Date.now();
    return {
      screens: screens.map((screen) => ({
        id: screen.id,
        name: screen.name,
        online:
          screen.last_seen_at !== null && now - screen.last_seen_at.getTime() < ONLINE_WINDOW_MS,
        lastSeenAt: screen.last_seen_at?.toISOString() ?? null,
        playerVersion: screen.player_version,
        platform: screen.platform,
      })),
    };
  });

  app.get(`${BASE}/alerts`, async (request) => {
    const key = await requireApiKey(ctx, request, 'alerts:write');
    const active = await activeAlertsQuery(ctx.db, key.orgId)
      .selectAll()
      .orderBy('starts_at', 'desc')
      .execute();
    return { alerts: active.map(alertDto) };
  });

  app.post(`${BASE}/alerts`, async (request, reply) => {
    const key = await requireApiKey(ctx, request, 'alerts:write');
    const body = parse(startAlertSchema, request.body);
    const { alert, screens } = await startAlert(ctx, key.orgId, body, {
      keyId: key.keyId,
      keyName: key.keyName,
    });
    return reply.status(201).send({ alert: alertDto(alert), screens });
  });

  app.post(`${BASE}/alerts/:alertId/end`, async (request) => {
    const key = await requireApiKey(ctx, request, 'alerts:write');
    const { alertId } = parse(z.object({ alertId: z.uuid() }), request.params);
    const alert = await endAlert(ctx, key.orgId, alertId, {
      keyId: key.keyId,
      keyName: key.keyName,
    });
    return { alert: alertDto(alert) };
  });

  /** Changes the text of a text or ticker widget (e.g. "Next in line: 42"). */
  app.patch(`${BASE}/widgets/:widgetId`, async (request) => {
    const key = await requireApiKey(ctx, request, 'widgets:write');
    const { widgetId } = parse(z.object({ widgetId: z.uuid() }), request.params);
    const body = parse(widgetPatchSchema, request.body);
    const widget = await ctx.db
      .selectFrom('widgets')
      .select(['id', 'type', 'config'])
      .where('id', '=', widgetId)
      .where('org_id', '=', key.orgId)
      .executeTakeFirst();
    if (!widget) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    if (!(widget.type in WRITABLE_WIDGETS)) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Only text and ticker widgets can be changed', [
        { path: 'widgetId', reason: 'invalid' },
      ]);
    }
    // Changes to what screens show wait for an admin when the organization asks for that;
    // an integration cannot wait, so it is refused (alerts are not affected).
    if (key.requireApproval) {
      throw new HttpError(
        409,
        'CONFLICT',
        'This organization approves content changes; integrations cannot change widgets',
      );
    }
    const allowed: readonly string[] =
      WRITABLE_WIDGETS[widget.type as keyof typeof WRITABLE_WIDGETS];
    const unknown = Object.keys(body).filter((field) => !allowed.includes(field));
    if (unknown.length > 0) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        'Field not available for this widget',
        unknown.map((path) => ({ path, reason: 'invalid' })),
      );
    }
    // null (or an empty text) removes an optional heading or label.
    const removed = new Set(
      Object.entries(body)
        .filter(([field, value]) => value === null || (field !== 'text' && value === ''))
        .map(([field]) => field),
    );
    const config: Record<string, unknown> = Object.fromEntries(
      Object.entries({ ...widget.config, ...body }).filter(([field]) => !removed.has(field)),
    );
    const parsed = parseWidgetConfig(widget.type, config);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        'Invalid widget content',
        parsed.issues.map((issue) => ({ path: issue.path, reason: 'invalid' })),
      );
    }
    await ctx.db
      .updateTable('widgets')
      .set({ config: JSON.stringify(parsed.config), updated_at: new Date() })
      .where('id', '=', widgetId)
      .where('org_id', '=', key.orgId)
      .execute();
    await notifyPlaylistScreens(ctx, await widgetPlaylists(ctx, widgetId));
    await audit(ctx.db, {
      action: 'widget.updated',
      orgId: key.orgId,
      targetType: 'widget',
      targetId: widgetId,
      meta: { fields: Object.keys(body), apiKeyId: key.keyId, apiKey: key.keyName },
    });
    return { widget: { id: widgetId, type: widget.type, config: parsed.config } };
  });
}
