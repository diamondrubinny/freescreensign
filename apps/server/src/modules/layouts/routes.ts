import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  layoutInputSchema,
  zonesOutOfBounds,
  type LayoutZoneInput,
  type ZoneAction,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Db } from '../../db/database.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { approvalGate } from '../approvals/routes.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { notifyLayoutScreens, notifyScreens, screensForLayouts } from '../screens/notify.js';

const layoutParams = z.object({ orgId: z.uuid(), layoutId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const MAX_LAYOUTS_PER_ORG = 500;

/** The stored action of a zone; a deleted target leaves none. */
export function zoneAction(
  type: 'layout' | 'back' | null,
  layoutId: string | null,
): ZoneAction | null {
  if (type === 'back') return { type: 'back' };
  if (type === 'layout' && layoutId) return { type: 'layout', layoutId };
  return null;
}

const layoutPatchSchema = z
  .object({
    name: layoutInputSchema.shape.name.optional(),
    width: layoutInputSchema.shape.width.optional(),
    height: layoutInputSchema.shape.height.optional(),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    idleSeconds: layoutInputSchema.shape.idleSeconds.unwrap().optional(),
    zones: layoutInputSchema.shape.zones.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export function layoutRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  // Changes to what screens show wait for an admin when the organization requires it.
  const gated = { preHandler: [orgGuard(ctx, 'EDITOR'), approvalGate(ctx, 'layout')] };

  async function loadLayout(orgId: string, layoutId: string) {
    const row = await ctx.db
      .selectFrom('layouts')
      .selectAll()
      .where('id', '=', layoutId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  /** Every referenced playlist must belong to the same organization (no cross-org IDOR). */
  async function assertPlaylists(orgId: string, zones: readonly LayoutZoneInput[]) {
    const ids = [...new Set(zones.flatMap((zone) => (zone.playlistId ? [zone.playlistId] : [])))];
    if (ids.length === 0) return;
    const found = await ctx.db
      .selectFrom('playlists')
      .select('id')
      .where('id', 'in', ids)
      .where('org_id', '=', orgId)
      .execute();
    const valid = new Set(found.map((row) => row.id));
    const invalid = zones.flatMap((zone, index) =>
      zone.playlistId && !valid.has(zone.playlistId)
        ? [{ path: `zones.${String(index)}.playlistId`, reason: 'invalid' }]
        : [],
    );
    if (invalid.length > 0) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown playlist', invalid);
    }
  }

  /** Tap targets must be other layouts of the same organization (no cross-org IDOR). */
  async function assertTargets(
    orgId: string,
    layoutId: string | null,
    zones: readonly LayoutZoneInput[],
  ) {
    const targetOf = (zone: LayoutZoneInput) =>
      zone.action?.type === 'layout' ? zone.action.layoutId : null;
    const ids = [...new Set(zones.flatMap((zone) => targetOf(zone) ?? []))];
    if (ids.length === 0) return;
    const found = await ctx.db
      .selectFrom('layouts')
      .select('id')
      .where('id', 'in', ids)
      .where('org_id', '=', orgId)
      .execute();
    const valid = new Set(found.map((row) => row.id));
    const invalid = zones.flatMap((zone, index) => {
      const target = targetOf(zone);
      if (!target) return [];
      const reason = target === layoutId ? 'self' : valid.has(target) ? null : 'invalid';
      return reason ? [{ path: `zones.${String(index)}.action.layoutId`, reason }] : [];
    });
    if (invalid.length > 0) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown layout', invalid);
    }
  }

  async function replaceZones(db: Db, layoutId: string, zones: readonly LayoutZoneInput[]) {
    await db.deleteFrom('layout_zones').where('layout_id', '=', layoutId).execute();
    await db
      .insertInto('layout_zones')
      .values(
        zones.map((zone, position) => ({
          layout_id: layoutId,
          position,
          name: zone.name,
          x: zone.x,
          y: zone.y,
          w: zone.w,
          h: zone.h,
          z: zone.z,
          playlist_id: zone.playlistId,
          action_type: zone.action?.type ?? null,
          action_layout_id: zone.action?.type === 'layout' ? zone.action.layoutId : null,
          label: zone.label || null,
        })),
      )
      .execute();
  }

  async function layoutDetail(orgId: string, layoutId: string) {
    const layout = await loadLayout(orgId, layoutId);
    const zones = await ctx.db
      .selectFrom('layout_zones')
      .leftJoin('playlists', 'playlists.id', 'layout_zones.playlist_id')
      .select([
        'layout_zones.id',
        'layout_zones.name',
        'layout_zones.x',
        'layout_zones.y',
        'layout_zones.w',
        'layout_zones.h',
        'layout_zones.z',
        'layout_zones.playlist_id',
        'layout_zones.action_type',
        'layout_zones.action_layout_id',
        'layout_zones.label',
        'playlists.name as playlist_name',
      ])
      .where('layout_zones.layout_id', '=', layoutId)
      .orderBy('layout_zones.position')
      .execute();
    const screens = await ctx.db
      .selectFrom('screens')
      .select(['id', 'name'])
      .where('layout_id', '=', layoutId)
      .orderBy('name')
      .execute();
    return {
      layout: {
        id: layout.id,
        name: layout.name,
        width: layout.width,
        height: layout.height,
        background: layout.background,
        idleSeconds: layout.idle_seconds,
        updatedAt: layout.updated_at.toISOString(),
        screens,
        zones: zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          x: zone.x,
          y: zone.y,
          w: zone.w,
          h: zone.h,
          z: zone.z,
          playlistId: zone.playlist_id,
          playlistName: zone.playlist_name,
          action: zoneAction(zone.action_type, zone.action_layout_id),
          label: zone.label,
        })),
      },
    };
  }

  app.get('/api/v1/orgs/:orgId/layouts', viewer, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('layouts')
      .select([
        'layouts.id',
        'layouts.name',
        'layouts.width',
        'layouts.height',
        'layouts.updated_at',
        (eb) =>
          eb
            .selectFrom('layout_zones')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('layout_zones.layout_id', '=', 'layouts.id')
            .as('zone_count'),
        (eb) =>
          eb
            .selectFrom('screens')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('screens.layout_id', '=', 'layouts.id')
            .as('screen_count'),
      ])
      .where('layouts.org_id', '=', org.id)
      .orderBy(sql`lower(layouts.name)`)
      .execute();
    const zones = rows.length
      ? await ctx.db
          .selectFrom('layout_zones')
          .select(['layout_id', 'x', 'y', 'w', 'h'])
          .where(
            'layout_id',
            'in',
            rows.map((row) => row.id),
          )
          .orderBy('position')
          .execute()
      : [];
    return {
      layouts: rows.map((row) => ({
        zones: zones
          .filter((zone) => zone.layout_id === row.id)
          .map(({ x, y, w, h }) => ({ x, y, w, h })),
        id: row.id,
        name: row.name,
        width: row.width,
        height: row.height,
        zoneCount: Number(row.zone_count),
        screenCount: Number(row.screen_count),
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  });

  app.post('/api/v1/orgs/:orgId/layouts', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(layoutInputSchema, request.body);
    await assertPlaylists(org.id, body.zones);
    await assertTargets(org.id, null, body.zones);
    const { count } = await ctx.db
      .selectFrom('layouts')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= MAX_LAYOUTS_PER_ORG) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many layouts in this organization');
    }
    const layoutId = await ctx.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('layouts')
        .values({
          org_id: org.id,
          name: body.name,
          width: body.width,
          height: body.height,
          background: body.background,
          idle_seconds: body.idleSeconds,
          created_by: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await replaceZones(trx, created.id, body.zones);
      return created.id;
    });
    await audit(ctx.db, {
      action: 'layout.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'layout',
      targetId: layoutId,
    });
    return reply.status(201).send(await layoutDetail(org.id, layoutId));
  });

  app.get('/api/v1/orgs/:orgId/layouts/:layoutId', viewer, async (request) => {
    const org = requireOrg(request);
    const { layoutId } = parse(layoutParams, request.params);
    return layoutDetail(org.id, layoutId);
  });

  /** Updates the layout; `zones`, when present, replaces all zones atomically. */
  app.patch('/api/v1/orgs/:orgId/layouts/:layoutId', gated, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { layoutId } = parse(layoutParams, request.params);
    const body = parse(layoutPatchSchema, request.body);
    const current = await loadLayout(org.id, layoutId);
    const canvas = { width: body.width ?? current.width, height: body.height ?? current.height };

    const zones =
      body.zones ??
      (await ctx.db
        .selectFrom('layout_zones')
        .select(['x', 'y', 'w', 'h'])
        .where('layout_id', '=', layoutId)
        .orderBy('position')
        .execute());
    const outside = zonesOutOfBounds(canvas, zones);
    if (outside.length > 0) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        'Zones exceed the canvas',
        outside.map((index) => ({ path: `zones.${String(index)}.w`, reason: 'out_of_bounds' })),
      );
    }
    if (body.zones) {
      await assertPlaylists(org.id, body.zones);
      await assertTargets(org.id, layoutId, body.zones);
    }

    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('layouts')
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.width !== undefined ? { width: body.width } : {}),
          ...(body.height !== undefined ? { height: body.height } : {}),
          ...(body.background !== undefined ? { background: body.background } : {}),
          ...(body.idleSeconds !== undefined ? { idle_seconds: body.idleSeconds } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', layoutId)
        .where('org_id', '=', org.id)
        .execute();
      if (body.zones) await replaceZones(trx, layoutId, body.zones);
    });
    await notifyLayoutScreens(ctx, layoutId);
    await audit(ctx.db, {
      action: 'layout.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'layout',
      targetId: layoutId,
      meta: { fields: Object.keys(body) },
    });
    return layoutDetail(org.id, layoutId);
  });

  /** Copies a layout with its zones; the copy is not assigned to any screen. */
  app.post('/api/v1/orgs/:orgId/layouts/:layoutId/duplicate', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { layoutId } = parse(layoutParams, request.params);
    const { name } = parse(z.object({ name: layoutInputSchema.shape.name }), request.body);
    const source = await loadLayout(org.id, layoutId);
    const copyId = await ctx.db.transaction().execute(async (trx) => {
      const copy = await trx
        .insertInto('layouts')
        .values({
          org_id: org.id,
          name,
          width: source.width,
          height: source.height,
          background: source.background,
          idle_seconds: source.idle_seconds,
          created_by: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('layout_zones')
        .columns([
          'layout_id',
          'position',
          'name',
          'x',
          'y',
          'w',
          'h',
          'z',
          'playlist_id',
          'action_type',
          'action_layout_id',
          'label',
        ])
        .expression((eb) =>
          eb
            .selectFrom('layout_zones')
            .select([
              sql<string>`${copy.id}::uuid`.as('layout_id'),
              'position',
              'name',
              'x',
              'y',
              'w',
              'h',
              'z',
              'playlist_id',
              'action_type',
              'action_layout_id',
              'label',
            ])
            .where('layout_id', '=', layoutId),
        )
        .execute();
      return copy.id;
    });
    await audit(ctx.db, {
      action: 'layout.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'layout',
      targetId: copyId,
      meta: { duplicatedFrom: layoutId },
    });
    return reply.status(201).send(await layoutDetail(org.id, copyId));
  });

  app.delete('/api/v1/orgs/:orgId/layouts/:layoutId', gated, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { layoutId } = parse(layoutParams, request.params);
    await loadLayout(org.id, layoutId);
    // Collected first: schedule entries showing this layout are deleted with it.
    const affected = await screensForLayouts(ctx, [layoutId]);
    await ctx.db
      .deleteFrom('layouts')
      .where('id', '=', layoutId)
      .where('org_id', '=', org.id)
      .execute();
    // Screens fall back to their playlist (layout_id is set to null by the database).
    await notifyScreens(ctx, affected);
    await audit(ctx.db, {
      action: 'layout.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'layout',
      targetId: layoutId,
    });
    return reply.status(204).send();
  });
}
