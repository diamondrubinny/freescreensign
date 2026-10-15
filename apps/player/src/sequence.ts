import type {
  ManifestLayout,
  ManifestMedia,
  ManifestPlaylist,
  ManifestV1,
  ManifestWidget,
} from '@rubinny/shared';
import { activeLayoutId } from './schedule';

type Transition = 'none' | 'fade' | 'slide';

export type PlayableItem =
  | { kind: 'media'; media: ManifestMedia; durationMs: number; transition: Transition }
  | { kind: 'widget'; widget: ManifestWidget; durationMs: number; transition: Transition };

const MAX_DEPTH = 8;

/** Expands a playlist (including nested playlists) into the flat list of items to play. */
export function flattenPlaylist(manifest: ManifestV1, playlistId: string | null): PlayableItem[] {
  if (!playlistId) return [];
  const playlists = new Map<string, ManifestPlaylist>(manifest.playlists.map((p) => [p.id, p]));
  const media = new Map<string, ManifestMedia>(manifest.media.map((m) => [m.id, m]));
  const widgets = new Map<string, ManifestWidget>(manifest.widgets.map((w) => [w.id, w]));
  const out: PlayableItem[] = [];

  const walk = (id: string, depth: number) => {
    const playlist = playlists.get(id);
    if (!playlist || depth > MAX_DEPTH) return;
    for (const item of playlist.items) {
      const { durationMs, transition } = item;
      if (item.kind === 'playlist') {
        walk(item.ref, depth + 1);
      } else if (item.kind === 'media') {
        const m = media.get(item.ref);
        if (m) out.push({ kind: 'media', media: m, durationMs, transition });
      } else {
        const w = widgets.get(item.ref);
        if (w) out.push({ kind: 'widget', widget: w, durationMs, transition });
      }
    }
  };
  walk(playlistId, 0);
  return out;
}

/** The layout to show now (schedule-aware). */
export function activeLayout(manifest: ManifestV1, now: Date): ManifestLayout | null {
  const id = activeLayoutId(manifest, now);
  return manifest.layouts.find((layout) => layout.id === id) ?? null;
}

/** Identity of what an item displays: equal keys need no re-render. */
export function itemKey(item: PlayableItem): string {
  return item.kind === 'media'
    ? `media:${item.media.id}:${item.media.sha256}`
    : `widget:${item.widget.id}:${JSON.stringify(item.widget.config)}`;
}
