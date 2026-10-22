// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  windowActive,
  type ItemWindow,
  type ManifestLayout,
  type ManifestMedia,
  type ManifestPlaylist,
  type ManifestV1,
  type ManifestWidget,
} from '@rubinny/shared';
import { activeLayoutId } from './schedule';

type Transition = 'none' | 'fade' | 'slide';
type Fit = 'contain' | 'cover' | 'blur';

export type PlayableItem = (
  | {
      kind: 'media';
      media: ManifestMedia;
      durationMs: number;
      transition: Transition;
      fit?: Fit;
      /** Video walls: start a video this far in (to join the other screens in sync). */
      startAtMs?: number;
    }
  | { kind: 'widget'; widget: ManifestWidget; durationMs: number; transition: Transition }
) & {
  /** Shown only when every window is open (its own, and those of the lists it is in). */
  windows?: ItemWindow[];
};

/** Whether the item shows now, on the screen's wall clock. */
export function itemShowing(item: PlayableItem, now: Date, timeZone: string): boolean {
  return (item.windows ?? []).every((window) => windowActive(window, now, timeZone));
}

const MAX_DEPTH = 8;

/** Expands a playlist (including nested playlists) into the flat list of items to play. */
export function flattenPlaylist(manifest: ManifestV1, playlistId: string | null): PlayableItem[] {
  if (!playlistId) return [];
  const playlists = new Map<string, ManifestPlaylist>(manifest.playlists.map((p) => [p.id, p]));
  const media = new Map<string, ManifestMedia>(manifest.media.map((m) => [m.id, m]));
  const widgets = new Map<string, ManifestWidget>(manifest.widgets.map((w) => [w.id, w]));
  const out: PlayableItem[] = [];

  const walk = (id: string, depth: number, outer: ItemWindow[]) => {
    const playlist = playlists.get(id);
    if (!playlist || depth > MAX_DEPTH) return;
    for (const item of playlist.items) {
      const { durationMs, transition } = item;
      const windows = item.window ? [...outer, item.window] : outer;
      const timed = windows.length > 0 ? { windows } : {};
      if (item.kind === 'playlist') {
        walk(item.ref, depth + 1, windows);
      } else if (item.kind === 'media') {
        const m = media.get(item.ref);
        if (m) {
          out.push({
            kind: 'media',
            media: m,
            durationMs,
            transition,
            ...(item.fit ? { fit: item.fit } : {}),
            ...timed,
          });
        }
      } else {
        const w = widgets.get(item.ref);
        if (w) out.push({ kind: 'widget', widget: w, durationMs, transition, ...timed });
      }
    }
  };
  walk(playlistId, 0, []);
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
    ? `media:${item.media.id}:${item.media.sha256}:${item.fit ?? 'contain'}`
    : `widget:${item.widget.id}:${JSON.stringify(item.widget.config)}`;
}

/**
 * Video walls: every screen loops a zone's items from the same moment (the Unix epoch on the
 * server's clock), so at any time all of them show the same item at the same point in it.
 * Returns the item to show at `nowMs` and how far into it that is.
 */
export function syncedPosition(
  items: readonly { durationMs: number }[],
  nowMs: number,
): { index: number; offsetMs: number } {
  const total = items.reduce((sum, item) => sum + item.durationMs, 0);
  if (items.length === 0 || total <= 0) return { index: 0, offsetMs: 0 };
  let position = ((nowMs % total) + total) % total;
  for (const [index, item] of items.entries()) {
    if (position < item.durationMs) return { index, offsetMs: position };
    position -= item.durationMs;
  }
  return { index: 0, offsetMs: 0 };
}
