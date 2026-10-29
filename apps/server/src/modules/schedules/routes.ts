// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  SCHEDULE_LIMITS,
  scheduleEntryInputSchema,
  scheduleInputSchema,
  type ScheduleEntryInput,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Db } from '../../db/database.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { approvalGate } from '../approvals/routes.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { assertSacredAvailable } from '../sacred/routes.js';
import { notifyScreens, screensForSchedule } from '../screens/notify.js';

const scheduleParams = z.object({ orgId: z.uuid(), scheduleId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');

const schedulePatchSchema = z
  .object({
    name: scheduleInputSchema.shape.name.optional(),
    entries: z.array(scheduleEntryInputSchema).max(SCHEDULE_LIMITS.maxEntries).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export function scheduleRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  // Changes to what screens show wait for an admin when the organization requires it.
  const gated = { preHandler: [orgGuard(ctx, 'EDITOR'), approvalGate(ctx, 'schedule')] };

  async function loadSchedule(orgId: string, scheduleId: string) {
    const row = await ctx.db
      .selectFrom('schedules')
      .selectAll()
      .where('id', '=', scheduleId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  /** Every layout and playlist an entry shows must belong to the same organization. */
  async function assertContent(orgId: string, entries: readonly ScheduleEntryInput[]) {
    const ids = (key: 'layoutId' | 'playlistId') => [
      ...new Set(entries.flatMap((entry) => (entry[key] ? [entry[key]] : []))),
    ];
    const layoutIds = ids('layoutId');
    const playlistIds = ids('playlistId');
    const layouts = new Set(
      layoutIds.length
        ? (
            await ctx.db
              .selectFrom('layouts')
              .select('id')
              .where('id', 'in', layoutIds)
              .where('org_id', '=', orgId)
              .execute()
          ).map((row) => row.id)
        : [],
    );
    const playlists = new Set(
      playlistIds.length
        ? (
            await ctx.db
              .selectFrom('playlists')
              .select('id')
              .where('id', 'in', playlistIds)
              .where('org_id', '=', orgId)
              .execute()
          ).map((row) => row.id)
        : [],
    );
    const invalid = entries.flatMap((entry, index) => {
      if (entry.layoutId && !layouts.has(entry.layoutId)) {
        return [{ path: `entries.${String(index)}.layoutId`, reason: 'invalid' }];
      }
      if (entry.playlistId && !playlists.has(entry.playlistId)) {
        return [{ path: `entries.${String(index)}.playlistId`, reason: 'invalid' }];
      }
      return [];
    });
    if (invalid.length > 0) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'Unknown layout or playlist', invalid);
    }
    await assertSacredAvailable(
      ctx.db,
      orgId,
      entries.flatMap((entry, index) => (entry.sacred ? [`entries.${String(index)}.sacred`] : [])),
    );
  }

  async function replaceEntries(
    db: Db,
    scheduleId: string,
    entries: readonly ScheduleEntryInput[],
  ) {
    await db.deleteFrom('schedule_entries').where('schedule_id', '=', scheduleId).execute();
    if (entries.length === 0) return;
    await db
      .insertInto('schedule_entries')
      .values(
        entries.map((entry, position) => ({
          schedule_id: scheduleId,
          position,
          name: entry.name,
          layout_id: entry.layoutId,
          playlist_id: entry.playlistId,
          date_from: entry.dateFrom,
          date_to: entry.dateTo,
          days_of_week: entry.daysOfWeek,
          time_from: entry.timeFrom,
          time_to: entry.timeTo,
          enabled: entry.enabled,
          sacred: entry.sacred,
        })),
      )
      .execute();
  }

  async function scheduleDetail(orgId: string, scheduleId: string) {
    const schedule = await loadSchedule(orgId, scheduleId);
    const entries = await ctx.db
      .selectFrom('schedule_entries')
      .leftJoin('layouts', 'layouts.id', 'schedule_entries.layout_id')
      .leftJoin('playlists', 'playlists.id', 'schedule_entries.playlist_id')
      .select([
        'schedule_entries.id',
        'schedule_entries.name',
        'schedule_entries.layout_id',
        'schedule_entries.playlist_id',
        'layouts.name as layout_name',
        'playlists.name as playlist_name',
        sql<string | null>`schedule_entries.date_from::text`.as('date_from'),
        sql<string | null>`schedule_entries.date_to::text`.as('date_to'),
        'schedule_entries.days_of_week',
        'schedule_entries.time_from',
        'schedule_entries.time_to',
        'schedule_entries.enabled',
        'schedule_entries.sacred',
      ])
      .where('schedule_entries.schedule_id', '=', scheduleId)
      .orderBy('schedule_entries.position')
      .execute();
    const screens = await ctx.db
      .selectFrom('screens')
      .select(['id', 'name', 'timezone'])
      .where('schedule_id', '=', scheduleId)
      .where('org_id', '=', orgId)
      .orderBy('name')
      .execute();
    return {
      schedule: {
        id: schedule.id,
        name: schedule.name,
        updatedAt: schedule.updated_at.toISOString(),
        screens,
        entries: entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          layoutId: entry.layout_id,
          layoutName: entry.layout_name,
          playlistId: entry.playlist_id,
          playlistName: entry.playlist_name,
          dateFrom: entry.date_from,
          dateTo: entry.date_to,
          daysOfWeek: entry.days_of_week,
          timeFrom: entry.time_from,
          timeTo: entry.time_to,
          enabled: entry.enabled,
          sacred: entry.sacred,
        })),
      },
    };
  }

  app.get('/api/v1/orgs/:orgId/schedules', viewer, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('schedules')
      .select([
        'schedules.id',
        'schedules.name',
        'schedules.updated_at',
        (eb) =>
          eb
            .selectFrom('schedule_entries')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('schedule_entries.schedule_id', '=', 'schedules.id')
            .as('entry_count'),
        (eb) =>
          eb
            .selectFrom('screens')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('screens.schedule_id', '=', 'schedules.id')
            .as('screen_count'),
      ])
      .where('schedules.org_id', '=', org.id)
      .orderBy(sql`lower(schedules.name)`)
      .execute();
    return {
      schedules: rows.map((row) => ({
        id: row.id,
        name: row.name,
        entryCount: Number(row.entry_count),
        screenCount: Number(row.screen_count),
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  });

  app.post('/api/v1/orgs/:orgId/schedules', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(scheduleInputSchema, request.body);
    await assertContent(org.id, body.entries);
    const { count } = await ctx.db
      .selectFrom('schedules')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= SCHEDULE_LIMITS.maxSchedulesPerOrg) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many schedules in this organization');
    }
    const scheduleId = await ctx.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('schedules')
        .values({ org_id: org.id, name: body.name, created_by: user.id })
        .returning('id')
        .executeTakeFirstOrThrow();
      await replaceEntries(trx, created.id, body.entries);
      return created.id;
    });
    await audit(ctx.db, {
      action: 'schedule.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'schedule',
      targetId: scheduleId,
    });
    return reply.status(201).send(await scheduleDetail(org.id, scheduleId));
  });

  app.get('/api/v1/orgs/:orgId/schedules/:scheduleId', viewer, async (request) => {
    const org = requireOrg(request);
    const { scheduleId } = parse(scheduleParams, request.params);
    return scheduleDetail(org.id, scheduleId);
  });

  /** Updates the schedule; `entries`, when present, replaces all entries atomically. */
  app.patch('/api/v1/orgs/:orgId/schedules/:scheduleId', gated, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { scheduleId } = parse(scheduleParams, request.params);
    const body = parse(schedulePatchSchema, request.body);
    await loadSchedule(org.id, scheduleId);
    if (body.entries) await assertContent(org.id, body.entries);
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('schedules')
        .set({ ...(body.name !== undefined ? { name: body.name } : {}), updated_at: new Date() })
        .where('id', '=', scheduleId)
        .where('org_id', '=', org.id)
        .execute();
      if (body.entries) await replaceEntries(trx, scheduleId, body.entries);
    });
    if (body.entries) await notifyScreens(ctx, await screensForSchedule(ctx, scheduleId));
    await audit(ctx.db, {
      action: 'schedule.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'schedule',
      targetId: scheduleId,
      meta: { fields: Object.keys(body) },
    });
    return scheduleDetail(org.id, scheduleId);
  });

  /** Copies a schedule with its entries; the copy is not assigned to any screen. */
  app.post(
    '/api/v1/orgs/:orgId/schedules/:scheduleId/duplicate',
    editor,
    async (request, reply) => {
      const org = requireOrg(request);
      const { user } = requireAuth(request);
      const { scheduleId } = parse(scheduleParams, request.params);
      const { name } = parse(z.object({ name: scheduleInputSchema.shape.name }), request.body);
      await loadSchedule(org.id, scheduleId);
      const { count } = await ctx.db
        .selectFrom('schedules')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('org_id', '=', org.id)
        .executeTakeFirstOrThrow();
      if (Number(count) >= SCHEDULE_LIMITS.maxSchedulesPerOrg) {
        throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many schedules in this organization');
      }
      const copyId = await ctx.db.transaction().execute(async (trx) => {
        const copy = await trx
          .insertInto('schedules')
          .values({ org_id: org.id, name, created_by: user.id })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('schedule_entries')
          .columns([
            'schedule_id',
            'position',
            'name',
            'layout_id',
            'playlist_id',
            'date_from',
            'date_to',
            'days_of_week',
            'time_from',
            'time_to',
            'enabled',
            'sacred',
          ])
          .expression((eb) =>
            eb
              .selectFrom('schedule_entries')
              .select([
                sql<string>`${copy.id}::uuid`.as('schedule_id'),
                'position',
                'name',
                'layout_id',
                'playlist_id',
                'date_from',
                'date_to',
                'days_of_week',
                'time_from',
                'time_to',
                'enabled',
                'sacred',
              ])
              .where('schedule_id', '=', scheduleId),
          )
          .execute();
        return copy.id;
      });
      await audit(ctx.db, {
        action: 'schedule.created',
        orgId: org.id,
        actorUserId: user.id,
        targetType: 'schedule',
        targetId: copyId,
        meta: { duplicatedFrom: scheduleId },
      });
      return reply.status(201).send(await scheduleDetail(org.id, copyId));
    },
  );

  app.delete('/api/v1/orgs/:orgId/schedules/:scheduleId', gated, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { scheduleId } = parse(scheduleParams, request.params);
    await loadSchedule(org.id, scheduleId);
    const affected = await screensForSchedule(ctx, scheduleId);
    await ctx.db
      .deleteFrom('schedules')
      .where('id', '=', scheduleId)
      .where('org_id', '=', org.id)
      .execute();
    // Screens fall back to their default content (schedule_id is set to null).
    await notifyScreens(ctx, affected);
    await audit(ctx.db, {
      action: 'schedule.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'schedule',
      targetId: scheduleId,
    });
    return reply.status(204).send();
  });
}
