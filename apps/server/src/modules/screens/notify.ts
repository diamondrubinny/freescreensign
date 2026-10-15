import { sql } from 'kysely';
import type { AppContext } from '../../context.js';

async function publishAll(ctx: AppContext, screenIds: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(screenIds)].map((id) => ctx.events.publish(id, { type: 'manifest.changed' })),
  );
}

/** Tells these screens to refetch their manifest. */
export async function notifyScreens(ctx: AppContext, screenIds: Iterable<string>): Promise<void> {
  await publishAll(ctx, screenIds);
}

/**
 * Screens playing one of these playlists: directly, through a layout zone, or through
 * a schedule entry (the playlist itself, or a layout containing it).
 */
export async function screensForPlaylists(
  ctx: AppContext,
  playlistIds: readonly string[],
): Promise<string[]> {
  if (playlistIds.length === 0) return [];
  const ids = [...playlistIds];
  const rows = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where((eb) => {
      const layoutsWith = eb
        .selectFrom('layout_zones')
        .select('layout_id')
        .where('playlist_id', 'in', ids);
      return eb.or([
        eb('playlist_id', 'in', ids),
        eb('layout_id', 'in', layoutsWith),
        eb(
          'schedule_id',
          'in',
          eb
            .selectFrom('schedule_entries')
            .select('schedule_id')
            .where((inner) =>
              inner.or([
                inner('schedule_entries.playlist_id', 'in', ids),
                inner(
                  'schedule_entries.layout_id',
                  'in',
                  inner
                    .selectFrom('layout_zones')
                    .select('layout_id')
                    .where('playlist_id', 'in', ids),
                ),
              ]),
            ),
        ),
      ]);
    })
    .execute();
  return rows.map((row) => row.id);
}

/** Screens showing one of these layouts, by default or through a schedule entry. */
export async function screensForLayouts(
  ctx: AppContext,
  layoutIds: readonly string[],
): Promise<string[]> {
  if (layoutIds.length === 0) return [];
  const ids = [...layoutIds];
  const rows = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where((eb) =>
      eb.or([
        eb('layout_id', 'in', ids),
        eb(
          'schedule_id',
          'in',
          eb.selectFrom('schedule_entries').select('schedule_id').where('layout_id', 'in', ids),
        ),
      ]),
    )
    .execute();
  return rows.map((row) => row.id);
}

/** Screens using a schedule. */
export async function screensForSchedule(ctx: AppContext, scheduleId: string): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where('schedule_id', '=', scheduleId)
    .execute();
  return rows.map((row) => row.id);
}

/** Tells every screen playing one of these playlists to refetch its manifest. */
export async function notifyPlaylistScreens(
  ctx: AppContext,
  playlistIds: readonly string[],
): Promise<void> {
  await publishAll(ctx, await screensForPlaylists(ctx, playlistIds));
}

/** Screens showing a layout (by default or through a schedule). */
export async function notifyLayoutScreens(ctx: AppContext, layoutId: string): Promise<void> {
  await publishAll(ctx, await screensForLayouts(ctx, [layoutId]));
}

async function playlistsContaining(
  ctx: AppContext,
  column: 'media_id' | 'widget_id',
  id: string,
): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('playlist_items')
    .select('playlist_id')
    .distinct()
    .where(column, '=', id)
    .execute();
  return rows.map((r) => r.playlist_id);
}

/** Screens affected by a media item (in a playlist, or inside a design widget). */
export async function notifyMediaScreens(ctx: AppContext, mediaId: string): Promise<void> {
  const designs = await ctx.db
    .selectFrom('widgets')
    .select('id')
    .where('type', '=', 'design')
    .where(sql<boolean>`config::text LIKE ${`%${mediaId}%`}`)
    .execute();
  const viaDesigns = await Promise.all(designs.map((w) => widgetPlaylists(ctx, w.id)));
  await notifyPlaylistScreens(ctx, [
    ...(await playlistsContaining(ctx, 'media_id', mediaId)),
    ...viaDesigns.flat(),
  ]);
}

/** Screens affected by a widget. Call before deleting it (the items cascade away). */
export async function widgetPlaylists(ctx: AppContext, widgetId: string): Promise<string[]> {
  return playlistsContaining(ctx, 'widget_id', widgetId);
}
