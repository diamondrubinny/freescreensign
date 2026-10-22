// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasRole, normalizePairingCode, timeZoneSchema, wallSchema } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Screen } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { parse } from '../../lib/validation.js';
import { approvalGate } from '../approvals/routes.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { nameSchema } from '../auth/schemas.js';
import { pairingAad, pairingCodeHash } from '../player/routes.js';

/** A screen counts as online if it called in within this window. */
export const ONLINE_WINDOW_MS = 90_000;

const ORIENTATIONS = ['landscape', 'portrait', 'landscape-flipped', 'portrait-flipped'] as const;
const screenParams = z.object({ orgId: z.uuid(), screenId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const invalidCode = () =>
  new HttpError(400, 'INVALID_TOKEN', 'The pairing code is invalid or has expired', [
    { path: 'code', reason: 'invalid' },
  ]);

export function screenDto(
  screen: Screen,
  playlistName: string | null,
  layoutName: string | null = null,
  scheduleName: string | null = null,
) {
  const lastSeen = screen.last_seen_at;
  return {
    id: screen.id,
    name: screen.name,
    playlistId: screen.playlist_id,
    playlistName,
    layoutId: screen.layout_id,
    layoutName,
    scheduleId: screen.schedule_id,
    scheduleName,
    orientation: screen.orientation,
    timezone: screen.timezone,
    online: lastSeen !== null && Date.now() - lastSeen.getTime() < ONLINE_WINDOW_MS,
    lastSeenAt: lastSeen?.toISOString() ?? null,
    playerVersion: screen.player_version,
    resolution: screen.resolution,
    manifestVersion: screen.manifest_version,
    clockOffsetMs: screen.clock_offset_ms,
    wall: screen.wall,
    createdAt: screen.created_at.toISOString(),
  };
}

export function screenRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  // Changes to what screens show wait for an admin when the organization requires it.
  const gated = { preHandler: [orgGuard(ctx, 'EDITOR'), approvalGate(ctx, 'screen')] };
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };

  async function assertPlaylistInOrg(orgId: string, playlistId: string | null | undefined) {
    if (!playlistId) return;
    const found = await ctx.db
      .selectFrom('playlists')
      .select('id')
      .where('id', '=', playlistId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!found) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown playlist', [
        { path: 'playlistId', reason: 'invalid' },
      ]);
    }
  }

  async function assertLayoutInOrg(orgId: string, layoutId: string | null | undefined) {
    if (!layoutId) return;
    const found = await ctx.db
      .selectFrom('layouts')
      .select('id')
      .where('id', '=', layoutId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!found) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown layout', [
        { path: 'layoutId', reason: 'invalid' },
      ]);
    }
  }

  async function assertScheduleInOrg(orgId: string, scheduleId: string | null | undefined) {
    if (!scheduleId) return;
    const found = await ctx.db
      .selectFrom('schedules')
      .select('id')
      .where('id', '=', scheduleId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!found) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown schedule', [
        { path: 'scheduleId', reason: 'invalid' },
      ]);
    }
  }

  async function loadScreen(orgId: string, screenId: string) {
    const row = await ctx.db
      .selectFrom('screens')
      .leftJoin('playlists', 'playlists.id', 'screens.playlist_id')
      .leftJoin('layouts', 'layouts.id', 'screens.layout_id')
      .leftJoin('schedules', 'schedules.id', 'screens.schedule_id')
      .selectAll('screens')
      .select([
        'playlists.name as playlist_name',
        'layouts.name as layout_name',
        'schedules.name as schedule_name',
      ])
      .where('screens.id', '=', screenId)
      .where('screens.org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    const {
      playlist_name: playlistName,
      layout_name: layoutName,
      schedule_name: scheduleName,
      ...screen
    } = row;
    return { screen, playlistName, layoutName, scheduleName };
  }

  app.get('/api/v1/orgs/:orgId/screens', viewer, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('screens')
      .leftJoin('playlists', 'playlists.id', 'screens.playlist_id')
      .leftJoin('layouts', 'layouts.id', 'screens.layout_id')
      .leftJoin('schedules', 'schedules.id', 'screens.schedule_id')
      .selectAll('screens')
      .select([
        'playlists.name as playlist_name',
        'layouts.name as layout_name',
        'schedules.name as schedule_name',
      ])
      .where('screens.org_id', '=', org.id)
      .orderBy('screens.name')
      .execute();
    const members = await ctx.db
      .selectFrom('screen_group_members')
      .select(['group_id', 'screen_id'])
      .where('org_id', '=', org.id)
      .execute();
    return {
      screens: rows.map(
        ({
          playlist_name: playlistName,
          layout_name: layoutName,
          schedule_name: scheduleName,
          ...screen
        }) => ({
          ...screenDto(screen, playlistName, layoutName, scheduleName),
          groupIds: members.filter((m) => m.screen_id === screen.id).map((m) => m.group_id),
        }),
      ),
    };
  });

  /** Claims a pairing code shown on a new screen and creates the screen. */
  app.post('/api/v1/orgs/:orgId/screens', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.screenClaimUser, user.id);
    const body = parse(
      z.object({
        code: z.string().max(20),
        name: nameSchema,
        playlistId: z.uuid().nullable().optional(),
        layoutId: z.uuid().nullable().optional(),
      }),
      request.body,
    );
    const normalized = normalizePairingCode(body.code);
    if (!normalized) throw invalidCode();
    // What a screen shows waits for approval: an editor pairs it empty, then assigns content
    // by editing the screen (a change that is held for an admin).
    if (org.requireApproval && !hasRole(org.role, 'ADMIN') && (body.playlistId || body.layoutId)) {
      throw new HttpError(409, 'CONFLICT', 'Assigning content needs approval', [
        { path: body.playlistId ? 'playlistId' : 'layoutId', reason: 'approval_required' },
      ]);
    }
    await assertPlaylistInOrg(org.id, body.playlistId);
    await assertLayoutInOrg(org.id, body.layoutId);
    const codeHash = pairingCodeHash(normalized);

    const deviceToken = randomToken();
    const screen = await ctx.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('screens')
        .values({
          org_id: org.id,
          name: body.name,
          token_hash: sha256Hex(deviceToken),
          playlist_id: body.playlistId ?? null,
          layout_id: body.layoutId ?? null,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      // Claim atomically: an unexpired, unclaimed code only.
      const claimed = await trx
        .updateTable('pairing_codes')
        .set({
          screen_id: created.id,
          device_token_enc: ctx.keys.encrypt(deviceToken, pairingAad(codeHash)),
        })
        .where('code_hash', '=', codeHash)
        .where('screen_id', 'is', null)
        .where('expires_at', '>', new Date())
        .executeTakeFirst();
      if (claimed.numUpdatedRows === 0n) throw invalidCode();
      return created;
    });

    await audit(ctx.db, {
      action: 'screen.paired',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen',
      targetId: screen.id,
    });
    const { playlistName, layoutName } = await loadScreen(org.id, screen.id);
    return reply.status(201).send({ screen: screenDto(screen, playlistName, layoutName) });
  });

  app.patch('/api/v1/orgs/:orgId/screens/:screenId', gated, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { screenId } = parse(screenParams, request.params);
    const body = parse(
      z
        .object({
          name: nameSchema.optional(),
          playlistId: z.uuid().nullable().optional(),
          layoutId: z.uuid().nullable().optional(),
          scheduleId: z.uuid().nullable().optional(),
          orientation: z.enum(ORIENTATIONS).optional(),
          wall: wallSchema.nullable().optional(),
          /** The wall clock schedules and time windows use on this screen. */
          timezone: timeZoneSchema.optional(),
        })
        .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    await loadScreen(org.id, screenId);
    await assertPlaylistInOrg(org.id, body.playlistId);
    await assertLayoutInOrg(org.id, body.layoutId);
    await assertScheduleInOrg(org.id, body.scheduleId);
    await ctx.db
      .updateTable('screens')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.playlistId !== undefined ? { playlist_id: body.playlistId } : {}),
        ...(body.layoutId !== undefined ? { layout_id: body.layoutId } : {}),
        ...(body.scheduleId !== undefined ? { schedule_id: body.scheduleId } : {}),
        ...(body.orientation !== undefined ? { orientation: body.orientation } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.wall !== undefined
          ? { wall: body.wall === null ? null : JSON.stringify(body.wall) }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', screenId)
      .where('org_id', '=', org.id)
      .execute();
    await ctx.events.publish(screenId, { type: 'manifest.changed' });
    await audit(ctx.db, {
      action: 'screen.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen',
      targetId: screenId,
      meta: { fields: Object.keys(body) },
    });
    const { screen, playlistName, layoutName, scheduleName } = await loadScreen(org.id, screenId);
    return { screen: screenDto(screen, playlistName, layoutName, scheduleName) };
  });

  app.post('/api/v1/orgs/:orgId/screens/:screenId/reload', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { screenId } = parse(screenParams, request.params);
    await loadScreen(org.id, screenId);
    await ctx.events.publish(screenId, { type: 'reload' });
    await audit(ctx.db, {
      action: 'screen.reloaded',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen',
      targetId: screenId,
    });
    return reply.status(202).send({ status: 'sent' });
  });

  /** Removes the screen and revokes its device token immediately. */
  app.delete('/api/v1/orgs/:orgId/screens/:screenId', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { screenId } = parse(screenParams, request.params);
    await loadScreen(org.id, screenId);
    await ctx.db
      .deleteFrom('screens')
      .where('id', '=', screenId)
      .where('org_id', '=', org.id)
      .execute();
    await ctx.events.publish(screenId, { type: 'revoked' });
    await audit(ctx.db, {
      action: 'screen.removed',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen',
      targetId: screenId,
    });
    return reply.status(204).send();
  });
}
