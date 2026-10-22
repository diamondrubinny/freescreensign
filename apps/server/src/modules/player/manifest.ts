// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import {
  designMediaIds,
  localTime,
  manifestV1Schema,
  parseWidgetConfig,
  TOUCH_LIMITS,
  windowEnded,
  type DesignConfig,
  type ManifestV1,
} from '@rubinny/shared';
import type { Env } from '../../config/env.js';
import type { Db } from '../../db/database.js';
import type { Screen } from '../../db/schema.js';
import { ACCEPTED_TYPES } from '../../media/types.js';
import { alertForScreen } from '../alerts/active.js';
import { zoneAction } from '../layouts/routes.js';

export const DEFAULT_IMAGE_DURATION_MS = 10_000;
export const DEFAULT_WIDGET_DURATION_MS = 15_000;

/** RSS widgets default to one full rotation through their items. */
export function defaultWidgetDurationMs(type: string, config: Record<string, unknown>): number {
  if (type === 'rss') {
    const parsed = parseWidgetConfig('rss', config);
    if (parsed.success) {
      const { maxItems, itemDurationMs } = parsed.config as {
        maxItems: number;
        itemDurationMs: number;
      };
      return Math.min(maxItems * itemDurationMs, 86_400_000);
    }
  }
  return DEFAULT_WIDGET_DURATION_MS;
}

const MAX_MANIFEST_LAYOUTS = 500;

const CANVAS = {
  landscape: { width: 1920, height: 1080 },
  'landscape-flipped': { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  'portrait-flipped': { width: 1080, height: 1920 },
} as const;

type ManifestLayoutInput = ManifestV1['layouts'][number];

interface ScheduleRow {
  id: string;
  layout_id: string | null;
  playlist_id: string | null;
  date_from: string | null;
  date_to: string | null;
  days_of_week: number[];
  time_from: string | null;
  time_to: string | null;
}

/** Settings the manifest depends on beyond the database. */
export type ManifestEnv = Pick<Env, 'PUBLIC_URL' | 'WEATHER_API_URL'>;

/**
 * Builds the player manifest for a screen. By default a screen shows a layout (zones,
 * each playing its own playlist) or, in simple mode, one implicit full-screen layout
 * playing the screen's playlist. Its schedule adds entries that switch to other layouts
 * or playlists at set times; the player evaluates them on the screen's wall clock.
 * Only ready, non-deleted media and valid, enabled widgets are included.
 */
export async function buildManifest(db: Db, screen: Screen, env: ManifestEnv): Promise<ManifestV1> {
  const canvas = CANVAS[screen.orientation];
  /** One full-screen zone playing a playlist (simple mode, and playlist schedule entries). */
  const fullScreen = (id: string, playlistId: string | null): ManifestLayoutInput => ({
    id,
    width: canvas.width,
    height: canvas.height,
    background: '#000000',
    zones: [{ id: 'main', x: 0, y: 0, w: canvas.width, h: canvas.height, z: 0, playlistId }],
  });

  const layoutCache = new Map<string, ManifestLayoutInput | null>();
  /** A layout of the screen's organization with at least one zone, else null. */
  const loadLayout = async (layoutId: string): Promise<ManifestLayoutInput | null> => {
    if (layoutCache.has(layoutId)) return layoutCache.get(layoutId) ?? null;
    const row = await db
      .selectFrom('layouts')
      .selectAll()
      .where('id', '=', layoutId)
      .where('org_id', '=', screen.org_id)
      .executeTakeFirst();
    const zones = row
      ? await db
          .selectFrom('layout_zones')
          .selectAll()
          .where('layout_id', '=', row.id)
          .orderBy('position')
          .execute()
      : [];
    const layout =
      row && zones.length > 0
        ? {
            id: row.id,
            width: row.width,
            height: row.height,
            background: row.background,
            idleSeconds: row.idle_seconds,
            zones: zones.map((zone) => {
              const action = zoneAction(zone.action_type, zone.action_layout_id);
              return {
                id: zone.id,
                x: zone.x,
                y: zone.y,
                w: zone.w,
                h: zone.h,
                z: zone.z,
                playlistId: zone.playlist_id,
                ...(action ? { action, label: (zone.label ?? zone.name).slice(0, 100) } : {}),
              };
            }),
          }
        : null;
    layoutCache.set(layoutId, layout);
    return layout;
  };

  const defaultLayout =
    (screen.layout_id ? await loadLayout(screen.layout_id) : null) ??
    fullScreen('default', screen.playlist_id);

  // Schedule entries, top first. Only enabled entries of the screen's own organization.
  const scheduled: { entry: ScheduleRow; layout: ManifestLayoutInput }[] = [];
  if (screen.schedule_id) {
    const rows = await db
      .selectFrom('schedule_entries')
      .innerJoin('schedules', 'schedules.id', 'schedule_entries.schedule_id')
      .select([
        'schedule_entries.id',
        'schedule_entries.layout_id',
        'schedule_entries.playlist_id',
        sql<string | null>`schedule_entries.date_from::text`.as('date_from'),
        sql<string | null>`schedule_entries.date_to::text`.as('date_to'),
        'schedule_entries.days_of_week',
        'schedule_entries.time_from',
        'schedule_entries.time_to',
      ])
      .where('schedules.id', '=', screen.schedule_id)
      .where('schedules.org_id', '=', screen.org_id)
      .where('schedule_entries.enabled', '=', true)
      .orderBy('schedule_entries.position')
      .execute();
    for (const entry of rows) {
      const layout = entry.layout_id
        ? await loadLayout(entry.layout_id)
        : entry.playlist_id
          ? fullScreen(`playlist-${entry.playlist_id}`, entry.playlist_id)
          : null;
      if (layout) scheduled.push({ entry, layout });
    }
  }

  const layoutsById = new Map<string, ManifestLayoutInput>([[defaultLayout.id, defaultLayout]]);
  for (const { layout } of scheduled) layoutsById.set(layout.id, layout);

  // Touch screens: layouts a tap can open, a few taps deep (same organization only).
  let frontier = [...layoutsById.values()];
  for (let depth = 0; depth < TOUCH_LIMITS.maxDepth && frontier.length > 0; depth++) {
    const next: ManifestLayoutInput[] = [];
    for (const layout of frontier) {
      for (const zone of layout.zones) {
        if (zone.action?.type !== 'layout' || layoutsById.has(zone.action.layoutId)) continue;
        const target = await loadLayout(zone.action.layoutId);
        if (target && layoutsById.size < MAX_MANIFEST_LAYOUTS) {
          layoutsById.set(target.id, target);
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  // A tap to a layout that is not in the manifest (deeper, deleted, other org) does nothing.
  for (const [id, layout] of layoutsById) {
    layoutsById.set(id, {
      ...layout,
      zones: layout.zones.map((zone) => {
        if (zone.action?.type !== 'layout' || layoutsById.has(zone.action.layoutId)) return zone;
        const rest = { ...zone };
        delete rest.action;
        delete rest.label;
        return rest;
      }),
    });
  }

  const playlistIds = [
    ...new Set(
      [...layoutsById.values()].flatMap((layout) =>
        layout.zones.flatMap((zone) => (zone.playlistId ? [zone.playlistId] : [])),
      ),
    ),
  ];
  // Playlists of other organizations are never followed, even if referenced.
  const ownPlaylists = playlistIds.length
    ? new Set(
        (
          await db
            .selectFrom('playlists')
            .select('id')
            .where('id', 'in', playlistIds)
            .where('org_id', '=', screen.org_id)
            .execute()
        ).map((row) => row.id),
      )
    : new Set<string>();

  const items = ownPlaylists.size
    ? await db
        .selectFrom('playlist_items')
        .leftJoin('media', (join) =>
          join
            .onRef('media.id', '=', 'playlist_items.media_id')
            .on('media.status', '=', 'ready')
            .on('media.deleted_at', 'is', null)
            .on('media.org_id', '=', screen.org_id),
        )
        .leftJoin('widgets', (join) =>
          join
            .onRef('widgets.id', '=', 'playlist_items.widget_id')
            .on('widgets.org_id', '=', screen.org_id),
        )
        .select([
          'playlist_items.playlist_id',
          'playlist_items.position',
          'playlist_items.duration_ms as item_duration_ms',
          'playlist_items.fit',
          'playlist_items.time_window',
          'media.id as media_id',
          'media.kind',
          'media.mime',
          'media.size_bytes',
          'media.sha256',
          'media.width',
          'media.height',
          'media.duration_ms',
          'widgets.id as widget_id',
          'widgets.type as widget_type',
          'widgets.config as widget_config',
        ])
        .where('playlist_items.playlist_id', 'in', [...ownPlaylists])
        .orderBy('playlist_items.playlist_id')
        .orderBy('playlist_items.position')
        .execute()
    : [];

  const publicOrigin = new URL(env.PUBLIC_URL).origin;
  const media = new Map<string, ManifestV1['media'][number]>();
  const widgets = new Map<string, ManifestV1['widgets'][number]>();
  const playlists = new Map<string, ManifestV1['playlists'][number]>(
    [...ownPlaylists].sort().map((id) => [id, { id, items: [] }]),
  );

  // Items whose window is over for good are left out (the player checks windows itself).
  const today = localTime(new Date(), screen.timezone).date;
  for (const item of items) {
    const playlist = playlists.get(item.playlist_id);
    if (!playlist || windowEnded(item.time_window, today)) continue;
    const window = item.time_window ? { window: item.time_window } : {};

    if (item.media_id && item.sha256 && item.mime && item.mime in ACCEPTED_TYPES) {
      if (!media.has(item.media_id)) {
        media.set(item.media_id, {
          id: item.media_id,
          mime: item.mime as ManifestV1['media'][number]['mime'],
          sizeBytes: Number(item.size_bytes),
          sha256: item.sha256,
          ...(item.width ? { width: item.width } : {}),
          ...(item.height ? { height: item.height } : {}),
          ...(item.duration_ms ? { durationMs: item.duration_ms } : {}),
        });
      }
      playlist.items.push({
        kind: 'media',
        ref: item.media_id,
        durationMs:
          item.item_duration_ms ??
          (item.kind === 'video' && item.duration_ms
            ? item.duration_ms
            : DEFAULT_IMAGE_DURATION_MS),
        transition: 'fade',
        ...(item.fit !== 'contain' ? { fit: item.fit } : {}),
        ...window,
      });
      continue;
    }

    if (item.widget_id && item.widget_type) {
      const type = item.widget_type;
      if (type === 'weather' && !env.WEATHER_API_URL) continue;
      const parsed = parseWidgetConfig(type, item.widget_config);
      if (!parsed.success) continue;
      // Defense in depth: never let a web page widget frame the system itself.
      if (type === 'webpage' && safeOrigin(String(parsed.config.url)) === publicOrigin) continue;
      if (!widgets.has(item.widget_id)) {
        widgets.set(item.widget_id, { id: item.widget_id, type, config: parsed.config });
      }
      playlist.items.push({
        kind: 'widget',
        ref: item.widget_id,
        durationMs: item.item_duration_ms ?? defaultWidgetDurationMs(type, parsed.config),
        transition: 'fade',
        ...window,
      });
    }
  }

  // Images used inside designs travel with the manifest like any other media.
  const designMedia = [
    ...new Set(
      [...widgets.values()]
        .filter((widget) => widget.type === 'design')
        .flatMap((widget) => designMediaIds(widget.config as DesignConfig)),
    ),
  ].filter((id) => !media.has(id));
  if (designMedia.length > 0) {
    const rows = await db
      .selectFrom('media')
      .select(['id', 'mime', 'size_bytes', 'sha256', 'width', 'height'])
      .where('id', 'in', designMedia)
      .where('org_id', '=', screen.org_id)
      .where('status', '=', 'ready')
      .where('deleted_at', 'is', null)
      .where('kind', '=', 'image')
      .execute();
    for (const row of rows) {
      if (!row.sha256 || !(row.mime in ACCEPTED_TYPES)) continue;
      media.set(row.id, {
        id: row.id,
        mime: row.mime as ManifestV1['media'][number]['mime'],
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256,
        ...(row.width ? { width: row.width } : {}),
        ...(row.height ? { height: row.height } : {}),
      });
    }
  }

  // Zones pointing to playlists of another organization play nothing.
  const layouts = [...layoutsById.values()].map((layout) => ({
    ...layout,
    zones: layout.zones.map((zone) =>
      zone.playlistId && !ownPlaylists.has(zone.playlistId) ? { ...zone, playlistId: null } : zone,
    ),
  }));
  // A playlist entry whose playlist is not the organization's would only show black.
  const entries = scheduled
    .filter(({ entry }) => !entry.playlist_id || ownPlaylists.has(entry.playlist_id))
    .map(({ entry, layout }, index, all) => ({
      id: entry.id,
      layoutId: layout.id,
      // Position is the priority: the first entry wins.
      priority: all.length - index,
      ...(entry.date_from ? { dateFrom: entry.date_from } : {}),
      ...(entry.date_to ? { dateTo: entry.date_to } : {}),
      ...(entry.days_of_week.length > 0 ? { daysOfWeek: entry.days_of_week } : {}),
      ...(entry.time_from && entry.time_to
        ? { timeFrom: entry.time_from, timeTo: entry.time_to }
        : {}),
    }));

  const body = {
    schemaVersion: 1 as const,
    screen: {
      id: screen.id,
      name: screen.name,
      timezone: screen.timezone,
      orientation: screen.orientation,
      ...(screen.wall ? { wall: screen.wall } : {}),
    },
    media: [...media.values()],
    widgets: [...widgets.values()],
    playlists: [...playlists.values()],
    layouts,
    schedule: { defaultLayoutId: defaultLayout.id, entries },
    alert: await alertForScreen(db, screen),
  };

  // The version identifies the content only (not the generation time).
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32);
  // Validate what we serve with the same schema the player uses.
  return manifestV1Schema.parse({ ...body, version, generatedAt: new Date().toISOString() });
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
