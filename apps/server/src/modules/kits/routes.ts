import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseWidgetConfig, templateZones } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { STARTER_KITS, STARTER_KIT_IDS, sampleCountdownTarget } from './kits.js';

const CANVAS = { width: 1920, height: 1080 };

export function kitRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };

  app.get('/api/v1/orgs/:orgId/starter-kits', viewer, () => ({
    kits: STARTER_KITS.map((kit) => ({ id: kit.id, template: kit.template })),
  }));

  /** Creates a ready-made screen: widgets, one playlist per zone and the layout, atomically. */
  app.post('/api/v1/orgs/:orgId/starter-kits/:kitId', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { kitId } = parse(
      z.object({ orgId: z.uuid(), kitId: z.enum(STARTER_KIT_IDS as [string, ...string[]]) }),
      request.params,
    );
    const { locale } = parse(
      z.object({ locale: z.enum(['he', 'en']).default('he') }),
      request.body,
    );
    const kit = STARTER_KITS.find((k) => k.id === kitId);
    if (!kit) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');

    const widgets = kit.widgets
      .filter((widget) => widget.type !== 'weather' || ctx.env.WEATHER_API_URL)
      .map((widget) => {
        const raw = { ...widget.config[locale] };
        if (widget.type === 'countdown') raw.target = sampleCountdownTarget();
        const parsed = parseWidgetConfig(widget.type, raw);
        // Kits are static data covered by tests; an invalid one is a programming error.
        if (!parsed.success) throw new Error(`Invalid starter kit widget ${kit.id}/${widget.key}`);
        return { ...widget, parsed: parsed.config };
      });

    const layoutId = await ctx.db.transaction().execute(async (trx) => {
      const widgetIds = new Map<string, string>();
      for (const widget of widgets) {
        const row = await trx
          .insertInto('widgets')
          .values({
            org_id: org.id,
            type: widget.type,
            name: widget.name[locale],
            config: JSON.stringify(widget.parsed),
            created_by: user.id,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        widgetIds.set(widget.key, row.id);
      }

      const layout = await trx
        .insertInto('layouts')
        .values({
          org_id: org.id,
          name: kit.name[locale],
          ...CANVAS,
          background: kit.background,
          created_by: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const zones = templateZones(kit.template, CANVAS);
      for (const [position, zone] of zones.entries()) {
        const spec = kit.zones[zone.name];
        let playlistId: string | null = null;
        if (spec) {
          const playlist = await trx
            .insertInto('playlists')
            .values({ org_id: org.id, name: spec.playlist[locale], created_by: user.id })
            .returning('id')
            .executeTakeFirstOrThrow();
          playlistId = playlist.id;
          const items = spec.widgets.flatMap((key) => {
            const id = widgetIds.get(key);
            return id ? [id] : [];
          });
          if (items.length > 0) {
            await trx
              .insertInto('playlist_items')
              .values(
                items.map((widgetId, index) => ({
                  playlist_id: playlist.id,
                  position: index,
                  widget_id: widgetId,
                  duration_ms: null,
                })),
              )
              .execute();
          }
        }
        await trx
          .insertInto('layout_zones')
          .values({
            layout_id: layout.id,
            position,
            name: spec ? (spec.playlist[locale].split(' — ').at(-1) ?? zone.name) : zone.name,
            x: zone.x,
            y: zone.y,
            w: zone.w,
            h: zone.h,
            z: zone.z,
            playlist_id: playlistId,
          })
          .execute();
      }
      return layout.id;
    });

    await audit(ctx.db, {
      action: 'layout.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'layout',
      targetId: layoutId,
      meta: { starterKit: kit.id },
    });
    return reply.status(201).send({ layout: { id: layoutId } });
  });
}
