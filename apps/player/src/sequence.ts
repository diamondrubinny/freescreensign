import type { ManifestMedia, ManifestPlaylist, ManifestV1 } from '@rubinny/shared';

export interface PlayableItem {
  media: ManifestMedia;
  durationMs: number;
  transition: 'none' | 'fade' | 'slide';
}

const MAX_DEPTH = 8;

/**
 * Expands a playlist (including nested playlists) into the flat list of media
 * items to play. Widgets are not rendered yet and are skipped.
 */
export function flattenPlaylist(manifest: ManifestV1, playlistId: string | null): PlayableItem[] {
  if (!playlistId) return [];
  const playlists = new Map<string, ManifestPlaylist>(manifest.playlists.map((p) => [p.id, p]));
  const media = new Map<string, ManifestMedia>(manifest.media.map((m) => [m.id, m]));
  const out: PlayableItem[] = [];

  const walk = (id: string, depth: number) => {
    const playlist = playlists.get(id);
    if (!playlist || depth > MAX_DEPTH) return;
    for (const item of playlist.items) {
      if (item.kind === 'playlist') walk(item.ref, depth + 1);
      else if (item.kind === 'media') {
        const m = media.get(item.ref);
        if (m) out.push({ media: m, durationMs: item.durationMs, transition: item.transition });
      }
    }
  };
  walk(playlistId, 0);
  return out;
}

/** The playlist bound to the main (largest) zone of a layout. */
export function mainZonePlaylist(manifest: ManifestV1, layoutId: string | null): string | null {
  const layout = manifest.layouts.find((l) => l.id === layoutId);
  if (!layout) return null;
  const zones = [...layout.zones].sort((a, b) => b.w * b.h - a.w * a.h);
  return zones[0]?.playlistId ?? null;
}
