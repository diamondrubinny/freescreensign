import { createHash } from 'node:crypto';
import { manifestV1Schema, parseWidgetConfig, type ManifestV1 } from '@rubinny/shared';
import type { Env } from '../../config/env.js';
import type { Db } from '../../db/database.js';
import type { Screen } from '../../db/schema.js';
import { ACCEPTED_TYPES } from '../../media/types.js';

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

const CANVAS = {
  landscape: { width: 1920, height: 1080 },
  'landscape-flipped': { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  'portrait-flipped': { width: 1080, height: 1920 },
} as const;

type ManifestLayoutInput = ManifestV1['layouts'][number];

/** Settings the manifest depends on beyond the database. */
export type ManifestEnv = Pick<Env, 'PUBLIC_URL' | 'WEATHER_API_URL'>;

/**
 * Builds the player manifest for a screen. A screen either shows a layout (zones,
 * each playing its own playlist) or, in simple mode, one implicit full-screen
 * layout playing the screen's playlist. Only ready, non-deleted media and valid,
 * enabled widgets are included.
 */
export async function buildManifest(db: Db, screen: Screen, env: ManifestEnv): Promise<ManifestV1> {
  const canvas = CANVAS[screen.orientation];
  let layout: ManifestLayoutInput = {
    id: 'default',
    width: canvas.width,
    height: canvas.height,
    background: '#000000',
    zones: [
      {
        id: 'main',
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
        z: 0,
        playlistId: screen.playlist_id,
      },
    ],
  };

  if (screen.layout_id) {
    const row = await db
      .selectFrom('layouts')
      .selectAll()
      .where('id', '=', screen.layout_id)
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
    if (row && zones.length > 0) {
      layout = {
        id: row.id,
        width: row.width,
        height: row.height,
        background: row.background,
        zones: zones.map((zone) => ({
          id: zone.id,
          x: zone.x,
          y: zone.y,
          w: zone.w,
          h: zone.h,
          z: zone.z,
          playlistId: zone.playlist_id,
        })),
      };
    }
  }

  const playlistIds = [
    ...new Set(layout.zones.flatMap((zone) => (zone.playlistId ? [zone.playlistId] : []))),
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

  for (const item of items) {
    const playlist = playlists.get(item.playlist_id);
    if (!playlist) continue;

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
      });
    }
  }

  // Zones pointing to playlists of another organization play nothing.
  layout = {
    ...layout,
    zones: layout.zones.map((zone) =>
      zone.playlistId && !ownPlaylists.has(zone.playlistId) ? { ...zone, playlistId: null } : zone,
    ),
  };

  const body = {
    schemaVersion: 1 as const,
    screen: {
      id: screen.id,
      name: screen.name,
      timezone: screen.timezone,
      orientation: screen.orientation,
    },
    media: [...media.values()],
    widgets: [...widgets.values()],
    playlists: [...playlists.values()],
    layouts: [layout],
    schedule: { defaultLayoutId: layout.id, entries: [] },
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
