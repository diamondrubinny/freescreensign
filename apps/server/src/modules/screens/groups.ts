// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { approvalGate } from '../approvals/routes.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';

/**
 * Screen groups (docs/phases/13-next-plan.md): named sets of screens of one organization,
 * to give many screens the same layout, playlist or schedule at once. Naming a group and
 * choosing its screens changes nothing on screen; assigning content does, so that step waits
 * for an admin when the organization requires approval.
 */

export const GROUP_LIMITS = { maxGroupsPerOrg: 200, maxScreensPerGroup: 1000 } as const;

const groupParams = z.object({ orgId: z.uuid(), groupId: z.uuid() });
const groupName = z.string().trim().min(1).max(100);
const screenIds = z
  .array(z.uuid())
  .max(GROUP_LIMITS.maxScreensPerGroup)
  .transform((ids) => [...new Set(ids)]);
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const nameTaken = () =>
  new HttpError(409, 'CONFLICT', 'A group with this name already exists', [
    { path: 'name', reason: 'taken' },
  ]);

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

export function screenGroupRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  /**
   * Assigning content applies to the screens in the group *now*: their ids go into the
   * request before the approval gate stores it, so a change of members while the request
   * waits cannot widen what an admin approves.
   */
  const snapshotMembers = async (request: FastifyRequest) => {
    const { groupId } = parse(groupParams, request.params);
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body) || 'screenIds' in body) {
      return;
    }
    const members = await ctx.db
      .selectFrom('screen_group_members')
      .select('screen_id')
      .where('group_id', '=', groupId)
      .where('org_id', '=', requireOrg(request).id)
      .execute();
    request.body = { ...body, screenIds: members.map((m) => m.screen_id) };
  };
  const gated = {
    preHandler: [orgGuard(ctx, 'EDITOR'), snapshotMembers, approvalGate(ctx, 'screenGroup')],
  };

  async function loadGroup(orgId: string, groupId: string) {
    const group = await ctx.db
      .selectFrom('screen_groups')
      .selectAll()
      .where('id', '=', groupId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!group) throw notFound();
    return group;
  }

  async function groupDto(orgId: string, groupId: string) {
    const group = await loadGroup(orgId, groupId);
    const members = await ctx.db
      .selectFrom('screen_group_members')
      .innerJoin('screens', 'screens.id', 'screen_group_members.screen_id')
      .select('screens.id')
      .where('screen_group_members.group_id', '=', groupId)
      .where('screen_group_members.org_id', '=', orgId)
      .orderBy('screens.name')
      .execute();
    return { id: group.id, name: group.name, screenIds: members.map((m) => m.id) };
  }

  /** Every id must be a screen of the organization (never another organization's). */
  async function assertScreens(orgId: string, ids: string[]) {
    if (ids.length === 0) return;
    const found = await ctx.db
      .selectFrom('screens')
      .select('id')
      .where('org_id', '=', orgId)
      .where('id', 'in', ids)
      .execute();
    const known = new Set(found.map((row) => row.id));
    const invalid = ids.flatMap((id, index) =>
      known.has(id) ? [] : [{ path: `screenIds.${String(index)}`, reason: 'invalid' }],
    );
    if (invalid.length > 0) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Some screens are not available', invalid);
    }
  }

  async function assertNameFree(orgId: string, name: string, except?: string) {
    let query = ctx.db
      .selectFrom('screen_groups')
      .select('id')
      .where('org_id', '=', orgId)
      .where(sql<string>`lower(name)`, '=', name.toLowerCase());
    if (except) query = query.where('id', '!=', except);
    if (await query.executeTakeFirst()) throw nameTaken();
  }

  async function setMembers(orgId: string, groupId: string, ids: string[]) {
    await ctx.db.deleteFrom('screen_group_members').where('group_id', '=', groupId).execute();
    if (ids.length > 0) {
      await ctx.db
        .insertInto('screen_group_members')
        .values(ids.map((screenId) => ({ org_id: orgId, group_id: groupId, screen_id: screenId })))
        .execute();
    }
  }

  app.get('/api/v1/orgs/:orgId/screen-groups', viewer, async (request) => {
    const org = requireOrg(request);
    const groups = await ctx.db
      .selectFrom('screen_groups')
      .select(['id', 'name'])
      .where('org_id', '=', org.id)
      .orderBy(sql`lower(name)`)
      .execute();
    const members = groups.length
      ? await ctx.db
          .selectFrom('screen_group_members')
          .select(['group_id', 'screen_id'])
          .where('org_id', '=', org.id)
          .execute()
      : [];
    return {
      groups: groups.map((group) => ({
        ...group,
        screenIds: members.filter((m) => m.group_id === group.id).map((m) => m.screen_id),
      })),
    };
  });

  app.post('/api/v1/orgs/:orgId/screen-groups', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(
      z.object({ name: groupName, screenIds: screenIds.default([]) }),
      request.body,
    );
    const { count } = await ctx.db
      .selectFrom('screen_groups')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= GROUP_LIMITS.maxGroupsPerOrg) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many screen groups');
    }
    await assertNameFree(org.id, body.name);
    await assertScreens(org.id, body.screenIds);
    let id: string;
    try {
      ({ id } = await ctx.db
        .insertInto('screen_groups')
        .values({ org_id: org.id, name: body.name })
        .returning('id')
        .executeTakeFirstOrThrow());
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    await setMembers(org.id, id, body.screenIds);
    await audit(ctx.db, {
      action: 'screen_group.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen_group',
      targetId: id,
      meta: { screens: body.screenIds.length },
    });
    return reply.status(201).send({ group: await groupDto(org.id, id) });
  });

  app.patch('/api/v1/orgs/:orgId/screen-groups/:groupId', editor, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { groupId } = parse(groupParams, request.params);
    const body = parse(
      z
        .object({ name: groupName.optional(), screenIds: screenIds.optional() })
        .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    await loadGroup(org.id, groupId);
    if (body.name !== undefined) await assertNameFree(org.id, body.name, groupId);
    if (body.screenIds) await assertScreens(org.id, body.screenIds);
    try {
      await ctx.db
        .updateTable('screen_groups')
        .set({ ...(body.name !== undefined ? { name: body.name } : {}), updated_at: new Date() })
        .where('id', '=', groupId)
        .where('org_id', '=', org.id)
        .execute();
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    if (body.screenIds) await setMembers(org.id, groupId, body.screenIds);
    await audit(ctx.db, {
      action: 'screen_group.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen_group',
      targetId: groupId,
      meta: { fields: Object.keys(body) },
    });
    return { group: await groupDto(org.id, groupId) };
  });

  /** Deletes the group only; its screens keep what they show. */
  app.delete('/api/v1/orgs/:orgId/screen-groups/:groupId', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { groupId } = parse(groupParams, request.params);
    await loadGroup(org.id, groupId);
    await ctx.db
      .deleteFrom('screen_groups')
      .where('id', '=', groupId)
      .where('org_id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'screen_group.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen_group',
      targetId: groupId,
    });
    return reply.status(204).send();
  });

  /** Gives every screen of the group the same layout, playlist and/or schedule. */
  app.put('/api/v1/orgs/:orgId/screen-groups/:groupId/content', gated, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { groupId } = parse(groupParams, request.params);
    const body = parse(
      z
        .object({
          playlistId: z.uuid().nullable().optional(),
          layoutId: z.uuid().nullable().optional(),
          scheduleId: z.uuid().nullable().optional(),
          /** The screens to change (members when asked); only those still in the group. */
          screenIds: z.array(z.uuid()).max(GROUP_LIMITS.maxScreensPerGroup).optional(),
        })
        .refine(
          (v) =>
            v.playlistId !== undefined || v.layoutId !== undefined || v.scheduleId !== undefined,
          { message: 'Nothing to update' },
        ),
      request.body,
    );
    const group = await groupDto(org.id, groupId);
    const asked = body.screenIds ? new Set(body.screenIds) : null;
    const targets = group.screenIds.filter((id) => !asked || asked.has(id));
    for (const [key, table] of [
      ['playlistId', 'playlists'],
      ['layoutId', 'layouts'],
      ['scheduleId', 'schedules'],
    ] as const) {
      const id = body[key];
      if (!id) continue;
      const found = await ctx.db
        .selectFrom(table)
        .select('id')
        .where('id', '=', id)
        .where('org_id', '=', org.id)
        .executeTakeFirst();
      if (!found) {
        throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown content', [
          { path: key, reason: 'invalid' },
        ]);
      }
    }
    if (targets.length > 0) {
      await ctx.db
        .updateTable('screens')
        .set({
          ...(body.playlistId !== undefined ? { playlist_id: body.playlistId } : {}),
          ...(body.layoutId !== undefined ? { layout_id: body.layoutId } : {}),
          ...(body.scheduleId !== undefined ? { schedule_id: body.scheduleId } : {}),
          updated_at: new Date(),
        })
        .where('org_id', '=', org.id)
        .where('id', 'in', targets)
        .execute();
      for (const screenId of targets) {
        await ctx.events.publish(screenId, { type: 'manifest.changed' });
      }
    }
    await audit(ctx.db, {
      action: 'screen_group.content_set',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen_group',
      targetId: groupId,
      meta: {
        fields: Object.keys(body).filter((key) => key !== 'screenIds'),
        screens: targets.length,
      },
    });
    return { group, updated: targets.length };
  });
}
