import { createHash } from 'node:crypto';
import { manifestV1Schema, type ManifestV1 } from '@rubinny/shared';
import type { Db } from '../../db/database.js';
import type { Screen } from '../../db/schema.js';
import { ACCEPTED_TYPES } from '../../media/types.js';

export const DEFAULT_IMAGE_DURATION_MS = 10_000;

const CANVAS = {
  landscape: { width: 1920, height: 1080 },
  'landscape-flipped': { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  'portrait-flipped': { width: 1080, height: 1920 },
} as const;

/**
 * Builds the player manifest for a screen. Until layouts arrive (phase 5) every
 * screen gets one implicit full-screen layout whose single zone plays the screen's
 * playlist. Only ready, non-deleted media is included.
 */
export async function buildManifest(db: Db, screen: Screen): Promise<ManifestV1> {
  const items = screen.playlist_id
    ? await db
        .selectFrom('playlist_items')
        .innerJoin('media', 'media.id', 'playlist_items.media_id')
        .select([
          'playlist_items.position',
          'playlist_items.duration_ms as item_duration_ms',
          'media.id',
          'media.kind',
          'media.mime',
          'media.size_bytes',
          'media.sha256',
          'media.width',
          'media.height',
          'media.duration_ms',
        ])
        .where('playlist_items.playlist_id', '=', screen.playlist_id)
        .where('media.status', '=', 'ready')
        .where('media.deleted_at', 'is', null)
        .where('media.org_id', '=', screen.org_id)
        .orderBy('playlist_items.position')
        .execute()
    : [];

  const media = new Map<string, ManifestV1['media'][number]>();
  for (const item of items) {
    if (media.has(item.id) || !item.sha256 || !(item.mime in ACCEPTED_TYPES)) continue;
    media.set(item.id, {
      id: item.id,
      mime: item.mime as ManifestV1['media'][number]['mime'],
      sizeBytes: Number(item.size_bytes),
      sha256: item.sha256,
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {}),
      ...(item.duration_ms ? { durationMs: item.duration_ms } : {}),
    });
  }

  const canvas = CANVAS[screen.orientation];
  const playlistId = screen.playlist_id;
  const body = {
    schemaVersion: 1 as const,
    screen: {
      id: screen.id,
      name: screen.name,
      timezone: screen.timezone,
      orientation: screen.orientation,
    },
    media: [...media.values()],
    widgets: [],
    playlists: playlistId
      ? [
          {
            id: playlistId,
            items: items
              .filter((item) => media.has(item.id))
              .map((item) => ({
                kind: 'media' as const,
                ref: item.id,
                durationMs:
                  item.item_duration_ms ??
                  (item.kind === 'video' && item.duration_ms
                    ? item.duration_ms
                    : DEFAULT_IMAGE_DURATION_MS),
                transition: 'fade' as const,
              })),
          },
        ]
      : [],
    layouts: [
      {
        id: 'default',
        width: canvas.width,
        height: canvas.height,
        background: '#000000',
        zones: [{ id: 'main', x: 0, y: 0, w: canvas.width, h: canvas.height, z: 0, playlistId }],
      },
    ],
    schedule: { defaultLayoutId: 'default', entries: [] },
  };

  // The version identifies the content only (not the generation time).
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32);
  // Validate what we serve with the same schema the player uses.
  return manifestV1Schema.parse({ ...body, version, generatedAt: new Date().toISOString() });
}
