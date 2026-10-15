import type { AppContext } from '../../context.js';

async function publishAll(ctx: AppContext, screenIds: Iterable<string>): Promise<void> {
  await Promise.all(
    [...new Set(screenIds)].map((id) => ctx.events.publish(id, { type: 'manifest.changed' })),
  );
}

/**
 * Tells every screen playing one of these playlists (directly, or through a
 * layout zone) to refetch its manifest.
 */
export async function notifyPlaylistScreens(
  ctx: AppContext,
  playlistIds: readonly string[],
): Promise<void> {
  if (playlistIds.length === 0) return;
  const ids = [...playlistIds];
  const screens = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where((eb) =>
      eb.or([
        eb('playlist_id', 'in', ids),
        eb(
          'layout_id',
          'in',
          eb.selectFrom('layout_zones').select('layout_id').where('playlist_id', 'in', ids),
        ),
      ]),
    )
    .execute();
  await publishAll(
    ctx,
    screens.map((s) => s.id),
  );
}

/** Screens showing a layout. */
export async function notifyLayoutScreens(ctx: AppContext, layoutId: string): Promise<void> {
  const screens = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where('layout_id', '=', layoutId)
    .execute();
  await publishAll(
    ctx,
    screens.map((s) => s.id),
  );
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

/** Screens affected by a media item (through any playlist that contains it). */
export async function notifyMediaScreens(ctx: AppContext, mediaId: string): Promise<void> {
  await notifyPlaylistScreens(ctx, await playlistsContaining(ctx, 'media_id', mediaId));
}

/** Screens affected by a widget. Call before deleting it (the items cascade away). */
export async function widgetPlaylists(ctx: AppContext, widgetId: string): Promise<string[]> {
  return playlistsContaining(ctx, 'widget_id', widgetId);
}
