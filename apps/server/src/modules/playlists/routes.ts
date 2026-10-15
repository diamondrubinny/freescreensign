import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { nameSchema } from '../auth/schemas.js';
import { DEFAULT_IMAGE_DURATION_MS } from '../player/manifest.js';
import { notifyPlaylistScreens } from '../screens/notify.js';

const playlistParams = z.object({ orgId: z.uuid(), playlistId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const MAX_ITEMS = 500;

export function playlistRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };

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
      .innerJoin('media', 'media.id', 'playlist_items.media_id')
      .select([
        'playlist_items.position',
        'playlist_items.duration_ms',
        'media.id as media_id',
        'media.name',
        'media.kind',
        'media.status',
        'media.duration_ms as media_duration_ms',
        'media.thumbnail_key',
        'media.deleted_at',
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
        items: items
          .filter((item) => item.deleted_at === null)
          .map((item) => ({
            mediaId: item.media_id,
            name: item.name,
            kind: item.kind,
            status: item.status,
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
          })),
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

  app.patch('/api/v1/orgs/:orgId/playlists/:playlistId', editor, async (request) => {
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
  app.put('/api/v1/orgs/:orgId/playlists/:playlistId/items', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { playlistId } = parse(playlistParams, request.params);
    const { items } = parse(
      z.object({
        items: z
          .array(
            z.object({
              mediaId: z.uuid(),
              durationMs: z.number().int().min(1000).max(86_400_000).nullable(),
            }),
          )
          .max(MAX_ITEMS),
      }),
      request.body,
    );
    await loadPlaylist(org.id, playlistId);

    const ids = [...new Set(items.map((item) => item.mediaId))];
    const valid = ids.length
      ? await ctx.db
          .selectFrom('media')
          .select('id')
          .where('id', 'in', ids)
          .where('org_id', '=', org.id)
          .where('status', '=', 'ready')
          .where('deleted_at', 'is', null)
          .execute()
      : [];
    const validIds = new Set(valid.map((row) => row.id));
    const invalid = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !validIds.has(item.mediaId))
      .map(({ index }) => ({ path: `items.${String(index)}.mediaId`, reason: 'invalid' }));
    if (invalid.length > 0)
      throw new HttpError(400, 'VALIDATION_FAILED', 'Some media items are not available', invalid);

    await ctx.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('playlist_items').where('playlist_id', '=', playlistId).execute();
      if (items.length > 0) {
        await trx
          .insertInto('playlist_items')
          .values(
            items.map((item, position) => ({
              playlist_id: playlistId,
              position,
              media_id: item.mediaId,
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

  app.delete('/api/v1/orgs/:orgId/playlists/:playlistId', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { playlistId } = parse(playlistParams, request.params);
    await loadPlaylist(org.id, playlistId);
    const affected = await ctx.db
      .selectFrom('screens')
      .select('id')
      .where('playlist_id', '=', playlistId)
      .execute();
    await ctx.db
      .deleteFrom('playlists')
      .where('id', '=', playlistId)
      .where('org_id', '=', org.id)
      .execute();
    await Promise.all(affected.map((s) => ctx.events.publish(s.id, { type: 'manifest.changed' })));
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
