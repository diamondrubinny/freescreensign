import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  DATA_WIDGET_TYPES,
  WIDGET_TYPES,
  designMediaIds,
  isWidgetType,
  parseWidgetConfig,
  type DesignConfig,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Widget } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { nameSchema } from '../auth/schemas.js';
import { notifyPlaylistScreens, widgetPlaylists } from '../screens/notify.js';
import { getWidgetData, weatherEnabled } from './data.js';
import { WEATHER_ATTRIBUTION } from './weather.js';

const widgetParams = z.object({ orgId: z.uuid(), widgetId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const MAX_WIDGETS_PER_ORG = 1000;

export function widgetDto(widget: Widget, usage: number) {
  return {
    id: widget.id,
    type: widget.type,
    name: widget.name,
    config: widget.config,
    usage,
    updatedAt: widget.updated_at.toISOString(),
  };
}

/**
 * Validates a widget configuration for saving. Beyond the shared schema:
 * weather must be enabled by the operator, and a web page may never come from
 * the system's own origin (it could read the player's device token).
 */
export function validateWidgetConfig(
  ctx: AppContext,
  type: string,
  config: unknown,
): Record<string, unknown> {
  if (!isWidgetType(type) || (type === 'weather' && !weatherEnabled(ctx))) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Unavailable widget type', [
      { path: 'type', reason: 'unavailable' },
    ]);
  }
  const result = parseWidgetConfig(type, config);
  if (!result.success) {
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      'Invalid widget configuration',
      result.issues.map((issue) => ({ path: `config.${issue.path}`, reason: 'invalid' })),
    );
  }
  if (type === 'webpage' && isOwnOrigin(ctx, String(result.config.url))) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'The system itself cannot be embedded', [
      { path: 'config.url', reason: 'own_origin' },
    ]);
  }
  return result.config;
}

/**
 * Designs may only use media of the same organization that is ready or still being
 * checked (never blocked, failed or deleted files).
 */
export async function assertDesignMedia(
  ctx: AppContext,
  orgId: string,
  type: string,
  config: Record<string, unknown>,
): Promise<void> {
  if (type !== 'design') return;
  const ids = designMediaIds(config as DesignConfig);
  if (ids.length === 0) return;
  const rows = await ctx.db
    .selectFrom('media')
    .select('id')
    .where('id', 'in', ids)
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['blocked', 'failed'])
    .where('kind', '=', 'image')
    .execute();
  const valid = new Set(rows.map((row) => row.id));
  const invalid = ids.filter((id) => !valid.has(id));
  if (invalid.length > 0) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Some images are not available', [
      { path: 'config.elements', reason: 'invalid' },
    ]);
  }
}

export function isOwnOrigin(ctx: AppContext, url: string): boolean {
  try {
    return new URL(url).origin === new URL(ctx.env.PUBLIC_URL).origin;
  } catch {
    return true;
  }
}

export function widgetRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };

  async function loadWidget(orgId: string, widgetId: string) {
    const row = await ctx.db
      .selectFrom('widgets')
      .selectAll()
      .where('id', '=', widgetId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async function assertWidgetQuota(orgId: string) {
    const { count } = await ctx.db
      .selectFrom('widgets')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', orgId)
      .executeTakeFirstOrThrow();
    if (Number(count) >= MAX_WIDGETS_PER_ORG) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many widgets in this organization');
    }
  }

  async function usageOf(widgetId: string): Promise<number> {
    return (await widgetPlaylists(ctx, widgetId)).length;
  }

  app.get('/api/v1/orgs/:orgId/widget-types', viewer, () => ({
    types: WIDGET_TYPES.map((type) => ({
      type,
      available: type !== 'weather' || weatherEnabled(ctx),
      serverData: (DATA_WIDGET_TYPES as readonly string[]).includes(type),
    })),
    weather: { enabled: weatherEnabled(ctx), attribution: WEATHER_ATTRIBUTION },
  }));

  app.get('/api/v1/orgs/:orgId/widgets', viewer, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('widgets')
      .selectAll('widgets')
      .select((eb) =>
        eb
          .selectFrom('playlist_items')
          .select(sql<string>`count(DISTINCT playlist_items.playlist_id)`.as('count'))
          .whereRef('playlist_items.widget_id', '=', 'widgets.id')
          .as('usage'),
      )
      .where('widgets.org_id', '=', org.id)
      .orderBy(sql`lower(widgets.name)`)
      .execute();
    return { widgets: rows.map(({ usage, ...widget }) => widgetDto(widget, Number(usage))) };
  });

  app.post('/api/v1/orgs/:orgId/widgets', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(
      z.object({ type: z.string().max(64), name: nameSchema, config: z.unknown() }),
      request.body,
    );
    const config = validateWidgetConfig(ctx, body.type, body.config);
    await assertDesignMedia(ctx, org.id, body.type, config);
    await assertWidgetQuota(org.id);
    const widget = await ctx.db
      .insertInto('widgets')
      .values({
        org_id: org.id,
        type: body.type,
        name: body.name,
        config: JSON.stringify(config),
        created_by: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'widget.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'widget',
      targetId: widget.id,
      meta: { type: widget.type },
    });
    return reply.status(201).send({ widget: widgetDto(widget, 0) });
  });

  app.get('/api/v1/orgs/:orgId/widgets/:widgetId', viewer, async (request) => {
    const org = requireOrg(request);
    const { widgetId } = parse(widgetParams, request.params);
    const widget = await loadWidget(org.id, widgetId);
    return { widget: widgetDto(widget, await usageOf(widgetId)) };
  });

  app.patch('/api/v1/orgs/:orgId/widgets/:widgetId', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { widgetId } = parse(widgetParams, request.params);
    const body = parse(
      z
        .object({ name: nameSchema.optional(), config: z.unknown().optional() })
        .refine((v) => v.name !== undefined || v.config !== undefined, {
          message: 'Nothing to update',
        }),
      request.body,
    );
    const current = await loadWidget(org.id, widgetId);
    const config =
      body.config !== undefined ? validateWidgetConfig(ctx, current.type, body.config) : undefined;
    if (config) await assertDesignMedia(ctx, org.id, current.type, config);
    const widget = await ctx.db
      .updateTable('widgets')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(config !== undefined ? { config: JSON.stringify(config) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', widgetId)
      .where('org_id', '=', org.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const playlists = await widgetPlaylists(ctx, widgetId);
    if (config !== undefined) await notifyPlaylistScreens(ctx, playlists);
    await audit(ctx.db, {
      action: 'widget.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'widget',
      targetId: widgetId,
      meta: { fields: Object.keys(body) },
    });
    return { widget: widgetDto(widget, playlists.length) };
  });

  app.post('/api/v1/orgs/:orgId/widgets/:widgetId/duplicate', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { widgetId } = parse(widgetParams, request.params);
    const { name } = parse(z.object({ name: nameSchema }), request.body);
    const source = await loadWidget(org.id, widgetId);
    await assertWidgetQuota(org.id);
    const widget = await ctx.db
      .insertInto('widgets')
      .values({
        org_id: org.id,
        type: source.type,
        name,
        config: JSON.stringify(source.config),
        created_by: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'widget.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'widget',
      targetId: widget.id,
      meta: { type: widget.type, duplicatedFrom: widgetId },
    });
    return reply.status(201).send({ widget: widgetDto(widget, 0) });
  });

  app.delete('/api/v1/orgs/:orgId/widgets/:widgetId', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { widgetId } = parse(widgetParams, request.params);
    await loadWidget(org.id, widgetId);
    const playlists = await widgetPlaylists(ctx, widgetId);
    // Playlist items referencing the widget cascade away (positions may then have gaps,
    // which is fine: items are always ordered by position).
    await ctx.db
      .deleteFrom('widgets')
      .where('id', '=', widgetId)
      .where('org_id', '=', org.id)
      .execute();
    await notifyPlaylistScreens(ctx, playlists);
    await audit(ctx.db, {
      action: 'widget.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'widget',
      targetId: widgetId,
    });
    return reply.status(204).send();
  });

  /** Preview of a data widget's content (RSS, weather, table), as the player will receive it. */
  app.get('/api/v1/orgs/:orgId/widgets/:widgetId/data', viewer, async (request) => {
    const org = requireOrg(request);
    const { widgetId } = parse(widgetParams, request.params);
    const widget = await loadWidget(org.id, widgetId);
    return getWidgetData(ctx, widget);
  });
}
