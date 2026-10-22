// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CLOCK_WARNING_MS, SCREENSHOT_LIMITS } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireOrg } from '../auth/guards.js';
import { ONLINE_WINDOW_MS } from '../screens/routes.js';
import { LIMITS } from '../../lib/limiter.js';
import { requireScreen } from '../player/auth.js';
import { ingestPlays, playUploadSchema } from './plays.js';
import { uptimeSummary } from './uptime.js';

type NowPlayingDto =
  | {
      zoneId: string;
      kind: 'media';
      id: string;
      name: string;
      mediaKind: 'image' | 'video';
      thumbnailUrl: string | null;
    }
  | { zoneId: string; kind: 'widget'; id: string; name: string; widgetType: string };

const screenParams = z.object({ orgId: z.uuid(), screenId: z.uuid() });
const HOUR_MS = 60 * 60 * 1000;
const isUuid = (value: string) => z.uuid().safeParse(value).success;

export function opsRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };

  /** Proof-of-play upload from a player (see PlayLog in the player). */
  app.post('/player/v1/plays', { bodyLimit: 512 * 1024 }, async (request) => {
    const screen = await requireScreen(ctx, request);
    await ctx.limiter.hit(LIMITS.playUploadScreen, screen.id);
    const { events } = parse(playUploadSchema, request.body);
    return ingestPlays(ctx.db, screen, events);
  });

  /** Live status of a screen: what it shows now, clock and uptime. */
  app.get('/api/v1/orgs/:orgId/screens/:screenId/status', viewer, async (request) => {
    const org = requireOrg(request);
    const { screenId } = parse(screenParams, request.params);
    const screen = await ctx.db
      .selectFrom('screens')
      .selectAll()
      .where('id', '=', screenId)
      .where('org_id', '=', org.id)
      .executeTakeFirst();
    if (!screen) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');

    const now = new Date();
    const online =
      screen.last_seen_at !== null &&
      now.getTime() - screen.last_seen_at.getTime() < ONLINE_WINDOW_MS;
    const [day, week] = await Promise.all([
      uptimeSummary(ctx.db, screen, new Date(now.getTime() - 24 * HOUR_MS), now),
      uptimeSummary(ctx.db, screen, new Date(now.getTime() - 7 * 24 * HOUR_MS), now),
    ]);

    // Names for what the player reported; only content of this organization is resolved.
    const items = online ? (screen.now_playing ?? []) : [];
    const ids = (kind: 'media' | 'widget') => [
      ...new Set(items.filter((item) => item.kind === kind).map((item) => item.ref)),
    ];
    const mediaIds = ids('media');
    const widgetIds = ids('widget');
    const media = new Map(
      (mediaIds.length
        ? await ctx.db
            .selectFrom('media')
            .select(['id', 'name', 'kind', 'status', 'thumbnail_key'])
            .where('id', 'in', mediaIds)
            .where('org_id', '=', org.id)
            .where('deleted_at', 'is', null)
            .execute()
        : []
      ).map((row) => [row.id, row]),
    );
    const widgets = new Map(
      (widgetIds.length
        ? await ctx.db
            .selectFrom('widgets')
            .select(['id', 'name', 'type'])
            .where('id', 'in', widgetIds)
            .where('org_id', '=', org.id)
            .execute()
        : []
      ).map((row) => [row.id, row]),
    );

    const layoutId = online ? screen.current_layout_id : null;
    let layout: { kind: 'layout' | 'playlist' | 'default'; name: string | null } | null = null;
    if (layoutId === 'default') {
      layout = { kind: 'default', name: null };
    } else if (layoutId?.startsWith('playlist-') && isUuid(layoutId.slice(9))) {
      const row = await ctx.db
        .selectFrom('playlists')
        .select('name')
        .where('id', '=', layoutId.slice(9))
        .where('org_id', '=', org.id)
        .executeTakeFirst();
      layout = { kind: 'playlist', name: row?.name ?? null };
    } else if (layoutId && isUuid(layoutId)) {
      const row = await ctx.db
        .selectFrom('layouts')
        .select('name')
        .where('id', '=', layoutId)
        .where('org_id', '=', org.id)
        .executeTakeFirst();
      layout = { kind: 'layout', name: row?.name ?? null };
    }

    const shot = await ctx.db
      .selectFrom('screen_screenshots')
      .select(['taken_at', 'width', 'height'])
      .where('screen_id', '=', screen.id)
      .executeTakeFirst();
    const offset = screen.clock_offset_ms;
    return {
      status: {
        online,
        lastSeenAt: screen.last_seen_at?.toISOString() ?? null,
        clockOffsetMs: offset,
        clockOk: offset === null ? null : Math.abs(offset) <= CLOCK_WARNING_MS,
        uptime: { day: day.ratio, week: week.ratio, hours: day.hours },
        platform: screen.platform,
        capabilities: screen.capabilities,
        screenshot: shot
          ? { takenAt: shot.taken_at.toISOString(), width: shot.width, height: shot.height }
          : null,
        screenshotPending:
          screen.screenshot_requested_at !== null &&
          now.getTime() - screen.screenshot_requested_at.getTime() <=
            SCREENSHOT_LIMITS.requestTtlMs,
        layout,
        nowPlaying: items.flatMap((item): NowPlayingDto[] => {
          if (item.kind === 'media') {
            const row = media.get(item.ref);
            if (!row) return [];
            return [
              {
                zoneId: item.zoneId,
                kind: 'media' as const,
                id: row.id,
                name: row.name,
                mediaKind: row.kind,
                thumbnailUrl:
                  row.status === 'ready' && row.thumbnail_key
                    ? `/api/v1/orgs/${org.id}/media/${row.id}/thumbnail`
                    : null,
              },
            ];
          }
          const row = widgets.get(item.ref);
          if (!row) return [];
          return [
            {
              zoneId: item.zoneId,
              kind: 'widget' as const,
              id: row.id,
              name: row.name,
              widgetType: row.type,
            },
          ];
        }),
      },
    };
  });
}
