import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { MEDIA_FITS } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { approvalGate } from '../approvals/routes.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { nameSchema } from '../auth/schemas.js';
import { DEFAULT_IMAGE_DURATION_MS, defaultWidgetDurationMs } from '../player/manifest.js';
import { notifyPlaylistScreens, notifyScreens, screensForPlaylists } from '../screens/notify.js';

const playlistParams = z.object({ orgId: z.uuid(), playlistId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const MAX_ITEMS = 500;

type PlaylistItemDto =
  | {
      kind: 'widget';
      widgetId: string;
      widgetType: string;
      name: string;
      durationMs: number | null;
      effectiveDurationMs: number;
    }
  | {
      kind: 'media';
      mediaId: string;
      name: string;
      mediaKind: 'image' | 'video';
      status: string | null;
      fit: 'contain' | 'cover' | 'blur';
      durationMs: number | null;
      effectiveDurationMs: number;
      thumbnailUrl: string | null;
    };

export function playlistRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  // Changes to what screens show wait for an admin when the organization requires it.
  const gated = { preHandler: [orgGuard(ctx, 'EDITOR'), approvalGate(ctx, 'playlist')] };

  async function loadPlaylist(orgId: string, playlistId: string) {
    const row = await ctx.db
      .selectFrom('playlists')
      .selectAll()
      .where('id', '=', playlistId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async function playlistDetail(orgId: string, playlistId: string) {
    const playlist = await loadPlaylist(orgId, playlistId);
    const items = await ctx.db
      .selectFrom('playlist_items')
      .leftJoin('media', 'media.id', 'playlist_items.media_id')
      .leftJoin('widgets', 'widgets.id', 'playlist_items.widget_id')
      .select([
        'playlist_items.position',
        'playlist_items.duration_ms',
        'playlist_items.media_id',
        'playlist_items.widget_id',
        'playlist_items.fit',
        'media.name as media_name',
        'media.kind',
        'media.status',
        'media.duration_ms as media_duration_ms',
        'media.thumbnail_key',
        'media.deleted_at',
        'widgets.name as widget_name',
        'widgets.type as widget_type',
        'widgets.config as widget_config',
      ])
      .where('playlist_items.playlist_id', '=', playlistId)
      .orderBy('playlist_items.position')
      .execute();
    const screens = await ctx.db
      .selectFrom('screens')
      .select(['id', 'name'])
      .where('playlist_id', '=', playlistId)
      .orderBy('name')
      .execute();
    return {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        updatedAt: playlist.updated_at.toISOString(),
        screens,
        items: items.flatMap((item): PlaylistItemDto[] => {
          if (item.widget_id !== null) {
            const type = item.widget_type ?? '';
            return [
              {
                kind: 'widget',
                widgetId: item.widget_id,
                widgetType: type,
                name: item.widget_name ?? '',
                durationMs: item.duration_ms,
                effectiveDurationMs:
                  item.duration_ms ?? defaultWidgetDurationMs(type, item.widget_config ?? {}),
              },
            ];
          }
          if (item.media_id === null || item.deleted_at !== null || item.kind === null) return [];
          return [
            {
              kind: 'media',
              mediaId: item.media_id,
              name: item.media_name ?? '',
              mediaKind: item.kind,
              status: item.status,
              fit: item.fit,
              durationMs: item.duration_ms,
              effectiveDurationMs:
                item.duration_ms ??
                (item.kind === 'video' && item.media_duration_ms
                  ? item.media_duration_ms
                  : DEFAULT_IMAGE_DURATION_MS),
              thumbnailUrl:
                item.status === 'ready' && item.thumbnail_key
                  ? `/api/v1/orgs/${orgId}/media/${item.media_id}/thumbnail`
                  : null,
            },
          ];
        }),
      },
    };
  }

  app.get('/api/v1/orgs/:orgId/playlists', viewer, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('playlists')
      .select([
        'playlists.id',
        'playlists.name',
        'playlists.updated_at',
        (eb) =>
          eb
            .selectFrom('playlist_items')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('playlist_items.playlist_id', '=', 'playlists.id')
            .as('item_count'),
        (eb) =>
          eb
            .selectFrom('screens')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('screens.playlist_id', '=', 'playlists.id')
            .as('screen_count'),
      ])
      .where('playlists.org_id', '=', org.id)
      .orderBy(sql`lower(playlists.name)`)
      .execute();
    return {
      playlists: rows.map((row) => ({
        id: row.id,
        name: row.name,
        itemCount: Number(row.item_count),
        screenCount: Number(row.screen_count),
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  });

  app.post('/api/v1/orgs/:orgId/playlists', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { name } = parse(z.object({ name: nameSchema }), request.body);
    const row = await ctx.db
      .insertInto('playlists')
      .values({ org_id: org.id, name, created_by: user.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'playlist.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'playlist',
      targetId: row.id,
    });
    return reply.status(201).send(await playlistDetail(org.id, row.id));
  });

  app.get('/api/v1/orgs/:orgId/playlists/:playlistId', viewer, async (request) => {
    const org = requireOrg(request);
    const { playlistId } = parse(playlistParams, request.params);
    return playlistDetail(org.id, playlistId);
  });

  app.patch('/api/v1/orgs/:orgId/playlists/:playlistId', gated, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { playlistId } = parse(playlistParams, request.params);
    const { name } = parse(z.object({ name: nameSchema }), request.body);
    await loadPlaylist(org.id, playlistId);
    await ctx.db
      .updateTable('playlists')
      .set({ name, updated_at: new Date() })
      .where('id', '=', playlistId)
      .where('org_id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'playlist.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'playlist',
      targetId: playlistId,
    });
    return playlistDetail(org.id, playlistId);
  });

  /** Replaces the ordered item list (simple, atomic and easy to make accessible in the UI). */
  app.put('/api/v1/orgs/:orgId/playlists/:playlistId/items', gated, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { playlistId } = parse(playlistParams, request.params);
    const duration = z.number().int().min(1000).max(86_400_000).nullable();
    const { items } = parse(
      z.object({
        items: z
          .array(
            z.union([
              z.object({
                mediaId: z.uuid(),
                durationMs: duration,
                fit: z.enum(MEDIA_FITS).default('contain'),
              }),
              z.object({ widgetId: z.uuid(), durationMs: duration }),
            ]),
          )
          .max(MAX_ITEMS),
      }),
      request.body,
    );
    await loadPlaylist(org.id, playlistId);

    const mediaIds = [
      ...new Set(items.flatMap((item) => ('mediaId' in item ? [item.mediaId] : []))),
    ];
    const widgetIds = [
      ...new Set(items.flatMap((item) => ('widgetId' in item ? [item.widgetId] : []))),
    ];
    const validMedia = mediaIds.length
      ? await ctx.db
          .selectFrom('media')
          .select('id')
          .where('id', 'in', mediaIds)
          .where('org_id', '=', org.id)
          .where('status', '=', 'ready')
          .where('deleted_at', 'is', null)
          .execute()
      : [];
    const validWidgets = widgetIds.length
      ? await ctx.db
          .selectFrom('widgets')
          .select('id')
          .where('id', 'in', widgetIds)
          .where('org_id', '=', org.id)
          .execute()
      : [];
    const valid = new Set([...validMedia, ...validWidgets].map((row) => row.id));
    const invalid = items.flatMap((item, index) => {
      const [key, id] = 'mediaId' in item ? ['mediaId', item.mediaId] : ['widgetId', item.widgetId];
      return valid.has(id) ? [] : [{ path: `items.${String(index)}.${key}`, reason: 'invalid' }];
    });
    if (invalid.length > 0)
      throw new HttpError(400, 'VALIDATION_FAILED', 'Some items are not available', invalid);

    await ctx.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('playlist_items').where('playlist_id', '=', playlistId).execute();
      if (items.length > 0) {
        await trx
          .insertInto('playlist_items')
          .values(
            items.map((item, position) => ({
              playlist_id: playlistId,
              position,
              media_id: 'mediaId' in item ? item.mediaId : null,
              widget_id: 'widgetId' in item ? item.widgetId : null,
              fit: 'mediaId' in item ? item.fit : 'contain',
              duration_ms: item.durationMs,
            })),
          )
          .execute();
      }
      await trx
        .updateTable('playlists')
        .set({ updated_at: new Date() })
        .where('id', '=', playlistId)
        .execute();
    });
    await notifyPlaylistScreens(ctx, [playlistId]);
    await audit(ctx.db, {
      action: 'playlist.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'playlist',
      targetId: playlistId,
      meta: { items: items.length },
    });
    return playlistDetail(org.id, playlistId);
  });

  /** Copies a playlist (name and items); the copy is not assigned to any screen. */
  app.post(
    '/api/v1/orgs/:orgId/playlists/:playlistId/duplicate',
    editor,
    async (request, reply) => {
      const org = requireOrg(request);
      const { user } = requireAuth(request);
      const { playlistId } = parse(playlistParams, request.params);
      const { name } = parse(z.object({ name: nameSchema }), request.body);
      await loadPlaylist(org.id, playlistId);
      const copyId = await ctx.db.transaction().execute(async (trx) => {
        const copy = await trx
          .insertInto('playlists')
          .values({ org_id: org.id, name, created_by: user.id })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('playlist_items')
          .columns(['playlist_id', 'position', 'media_id', 'widget_id', 'duration_ms', 'fit'])
          .expression((eb) =>
            eb
              .selectFrom('playlist_items')
              .select([
                sql<string>`${copy.id}::uuid`.as('playlist_id'),
                'position',
                'media_id',
                'widget_id',
                'duration_ms',
                'fit',
              ])
              .where('playlist_id', '=', playlistId),
          )
          .execute();
        return copy.id;
      });
      await audit(ctx.db, {
        action: 'playlist.created',
        orgId: org.id,
        actorUserId: user.id,
        targetType: 'playlist',
        targetId: copyId,
        meta: { duplicatedFrom: playlistId },
      });
      return reply.status(201).send(await playlistDetail(org.id, copyId));
    },
  );

  app.delete('/api/v1/orgs/:orgId/playlists/:playlistId', gated, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { playlistId } = parse(playlistParams, request.params);
    await loadPlaylist(org.id, playlistId);
    // Collected first: zones, items and schedule entries referencing it change or go away.
    const affected = await screensForPlaylists(ctx, [playlistId]);
    await ctx.db
      .deleteFrom('playlists')
      .where('id', '=', playlistId)
      .where('org_id', '=', org.id)
      .execute();
    await notifyScreens(ctx, affected);
    await audit(ctx.db, {
      action: 'playlist.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'playlist',
      targetId: playlistId,
    });
    return reply.status(204).send();
  });
}
