import type { AppContext } from '../../context.js';

/** Tells every screen playing one of these playlists to refetch its manifest. */
export async function notifyPlaylistScreens(
  ctx: AppContext,
  playlistIds: readonly string[],
): Promise<void> {
  if (playlistIds.length === 0) return;
  const screens = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where('playlist_id', 'in', [...playlistIds])
    .execute();
  await Promise.all(screens.map((s) => ctx.events.publish(s.id, { type: 'manifest.changed' })));
}

/** Screens affected by a media item (through any playlist that contains it). */
export async function notifyMediaScreens(ctx: AppContext, mediaId: string): Promise<void> {
  const rows = await ctx.db
    .selectFrom('playlist_items')
    .select('playlist_id')
    .distinct()
    .where('media_id', '=', mediaId)
    .execute();
  await notifyPlaylistScreens(
    ctx,
    rows.map((r) => r.playlist_id),
  );
}
