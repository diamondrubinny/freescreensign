import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizePairingCode } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Screen } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { parse } from '../../lib/validation.js';
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
) {
  const lastSeen = screen.last_seen_at;
  return {
    id: screen.id,
    name: screen.name,
    playlistId: screen.playlist_id,
    playlistName,
    layoutId: screen.layout_id,
    layoutName,
    orientation: screen.orientation,
    timezone: screen.timezone,
    online: lastSeen !== null && Date.now() - lastSeen.getTime() < ONLINE_WINDOW_MS,
    lastSeenAt: lastSeen?.toISOString() ?? null,
    playerVersion: screen.player_version,
    resolution: screen.resolution,
    manifestVersion: screen.manifest_version,
    createdAt: screen.created_at.toISOString(),
  };
}

export function screenRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
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

  async function loadScreen(orgId: string, screenId: string) {
    const row = await ctx.db
      .selectFrom('screens')
      .leftJoin('playlists', 'playlists.id', 'screens.playlist_id')
      .leftJoin('layouts', 'layouts.id', 'screens.layout_id')
      .selectAll('screens')
      .select(['playlists.name as playlist_name', 'layouts.name as layout_name'])
      .where('screens.id', '=', screenId)
      .where('screens.org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    const { playlist_name: playlistName, layout_name: layoutName, ...screen } = row;
    return { screen, playlistName, layoutName };
  }

  app.get('/api/v1/orgs/:orgId/screens', viewer, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('screens')
      .leftJoin('playlists', 'playlists.id', 'screens.playlist_id')
      .leftJoin('layouts', 'layouts.id', 'screens.layout_id')
      .selectAll('screens')
      .select(['playlists.name as playlist_name', 'layouts.name as layout_name'])
      .where('screens.org_id', '=', org.id)
      .orderBy('screens.name')
      .execute();
    return {
      screens: rows.map(({ playlist_name: playlistName, layout_name: layoutName, ...screen }) =>
        screenDto(screen, playlistName, layoutName),
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

  app.patch('/api/v1/orgs/:orgId/screens/:screenId', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { screenId } = parse(screenParams, request.params);
    const body = parse(
      z
        .object({
          name: nameSchema.optional(),
          playlistId: z.uuid().nullable().optional(),
          layoutId: z.uuid().nullable().optional(),
          orientation: z.enum(ORIENTATIONS).optional(),
        })
        .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    await loadScreen(org.id, screenId);
    await assertPlaylistInOrg(org.id, body.playlistId);
    await assertLayoutInOrg(org.id, body.layoutId);
    await ctx.db
      .updateTable('screens')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.playlistId !== undefined ? { playlist_id: body.playlistId } : {}),
        ...(body.layoutId !== undefined ? { layout_id: body.layoutId } : {}),
        ...(body.orientation !== undefined ? { orientation: body.orientation } : {}),
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
    const { screen, playlistName, layoutName } = await loadScreen(org.id, screenId);
    return { screen: screenDto(screen, playlistName, layoutName) };
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
