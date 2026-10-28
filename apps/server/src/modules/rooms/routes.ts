// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  bookingInputSchema,
  bookingTitleSchema,
  hasRole,
  ROOM_LIMITS,
  roomInputSchema,
  roomNameSchema,
  roomPinSchema,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { RoomBookingsTable, RoomsTable } from '../../db/schema.js';
import type { Selectable } from 'kysely';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { hashPassword } from '../../lib/password.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { isOverlap, notifyRoomChanged, roomBusy } from './service.js';

/**
 * Meeting rooms in the dashboard (docs/phases/18-rooms-directory-calendar-zmanim.md).
 * Any member books; admins manage rooms, the PIN for booking at screens, and others'
 * bookings. Bookings are not content, so they never wait for approval.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const roomParams = z.object({ orgId: z.uuid(), roomId: z.uuid() });
const bookingParams = z.object({ orgId: z.uuid(), bookingId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const nameTaken = () =>
  new HttpError(409, 'CONFLICT', 'A room with this name already exists', [
    { path: 'name', reason: 'taken' },
  ]);
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

function roomDto(room: Selectable<RoomsTable>) {
  return {
    id: room.id,
    name: room.name,
    location: room.location,
    capacity: room.capacity,
    showTitles: room.show_titles,
  };
}

type BookingRow = Selectable<RoomBookingsTable> & { booked_by_name: string | null };

function bookingDto(row: BookingRow, userId: string, isAdmin: boolean) {
  return {
    id: row.id,
    roomId: row.room_id,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    title: row.title,
    bookedBy: row.booked_by ? { id: row.booked_by, name: row.booked_by_name } : null,
    /** Booked at a room's screen ("Book now"). */
    atScreen: row.screen_id !== null,
    canEdit: isAdmin || row.booked_by === userId,
  };
}

export function roomRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };

  async function loadRoom(orgId: string, roomId: string) {
    const room = await ctx.db
      .selectFrom('rooms')
      .selectAll()
      .where('id', '=', roomId)
      .where('org_id', '=', orgId)
      .executeTakeFirst();
    if (!room) throw notFound();
    return room;
  }

  async function loadBooking(orgId: string, bookingId: string): Promise<BookingRow> {
    const row = await ctx.db
      .selectFrom('room_bookings')
      .leftJoin('users', 'users.id', 'room_bookings.booked_by')
      .selectAll('room_bookings')
      .select('users.name as booked_by_name')
      .where('room_bookings.id', '=', bookingId)
      .where('room_bookings.org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) throw notFound();
    return row;
  }

  async function assertNameFree(orgId: string, name: string, except?: string) {
    let query = ctx.db
      .selectFrom('rooms')
      .select('id')
      .where('org_id', '=', orgId)
      .where(sql<string>`lower(name)`, '=', name.toLowerCase());
    if (except) query = query.where('id', '!=', except);
    if (await query.executeTakeFirst()) throw nameTaken();
  }

  /**
   * A member changes their own bookings; someone else's needs an admin (with two-step
   * verification when the organization requires it for admin actions).
   */
  function assertMayEdit(request: Parameters<typeof requireAuth>[0], booking: BookingRow) {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    if (booking.booked_by === user.id) return;
    if (!hasRole(org.role, 'ADMIN')) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action');
    }
    if (org.requireAdminMfa && !user.mfa_enabled_at) {
      throw new HttpError(
        403,
        'MFA_SETUP_REQUIRED',
        'Enable two-factor authentication to perform administrative actions',
      );
    }
  }

  /** Bookings start at most a year ahead, and not in the past (a few minutes of grace). */
  function assertWhen(startsAt: Date) {
    const now = Date.now();
    if (startsAt.getTime() < now - 5 * 60 * 1000) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'A booking cannot start in the past', [
        { path: 'startsAt', reason: 'past' },
      ]);
    }
    if (startsAt.getTime() > now + ROOM_LIMITS.maxDaysAhead * DAY_MS) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'A booking can start up to a year ahead', [
        { path: 'startsAt', reason: 'too_far' },
      ]);
    }
  }

  // ------------------------------------------------------------------ rooms
  app.get('/api/v1/orgs/:orgId/rooms', viewer, async (request) => {
    const org = requireOrg(request);
    const [rooms, settings] = await Promise.all([
      ctx.db
        .selectFrom('rooms')
        .selectAll()
        .where('org_id', '=', org.id)
        .orderBy(sql`lower(name)`)
        .execute(),
      ctx.db
        .selectFrom('organizations')
        .select('room_pin_hash')
        .where('id', '=', org.id)
        .executeTakeFirstOrThrow(),
    ]);
    return { rooms: rooms.map(roomDto), pinSet: settings.room_pin_hash !== null };
  });

  app.post('/api/v1/orgs/:orgId/rooms', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(roomInputSchema, request.body);
    const { count } = await ctx.db
      .selectFrom('rooms')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= ROOM_LIMITS.maxRoomsPerOrg) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many rooms');
    }
    await assertNameFree(org.id, body.name);
    let room;
    try {
      room = await ctx.db
        .insertInto('rooms')
        .values({
          org_id: org.id,
          name: body.name,
          location: body.location || null,
          capacity: body.capacity,
          show_titles: body.showTitles,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    await audit(ctx.db, {
      action: 'room.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'room',
      targetId: room.id,
    });
    return reply.status(201).send({ room: roomDto(room) });
  });

  app.patch('/api/v1/orgs/:orgId/rooms/:roomId', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { roomId } = parse(roomParams, request.params);
    const body = parse(
      z
        .object({
          name: roomNameSchema.optional(),
          location: z.string().trim().max(120).nullable().optional(),
          capacity: z.number().int().min(1).max(1000).nullable().optional(),
          showTitles: z.boolean().optional(),
        })
        .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    await loadRoom(org.id, roomId);
    if (body.name !== undefined) await assertNameFree(org.id, body.name, roomId);
    let room;
    try {
      room = await ctx.db
        .updateTable('rooms')
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.location !== undefined ? { location: body.location || null } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
          ...(body.showTitles !== undefined ? { show_titles: body.showTitles } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', roomId)
        .where('org_id', '=', org.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    await audit(ctx.db, {
      action: 'room.updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'room',
      targetId: roomId,
      meta: { fields: Object.keys(body) },
    });
    await notifyRoomChanged(ctx, org.id, roomId);
    return { room: roomDto(room) };
  });

  /** Deletes the room with all its bookings; room widgets of it show "Room not found". */
  app.delete('/api/v1/orgs/:orgId/rooms/:roomId', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { roomId } = parse(roomParams, request.params);
    await loadRoom(org.id, roomId);
    await ctx.db
      .deleteFrom('rooms')
      .where('id', '=', roomId)
      .where('org_id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'room.deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'room',
      targetId: roomId,
    });
    await notifyRoomChanged(ctx, org.id, roomId);
    return reply.status(204).send();
  });

  /** Sets or clears the organization's PIN for booking at screens. */
  app.put('/api/v1/orgs/:orgId/settings/room-pin', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { pin } = parse(z.object({ pin: roomPinSchema }), request.body);
    await ctx.db
      .updateTable('organizations')
      .set({ room_pin_hash: pin === null ? null : await hashPassword(pin), updated_at: new Date() })
      .where('id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: pin === null ? 'room.pin_cleared' : 'room.pin_set',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: org.id,
    });
    // Room screens show or hide "Book now".
    const rooms = await ctx.db
      .selectFrom('rooms')
      .select('id')
      .where('org_id', '=', org.id)
      .execute();
    await notifyRoomChanged(
      ctx,
      org.id,
      rooms.map((room) => room.id),
    );
    return { pinSet: pin !== null };
  });

  // --------------------------------------------------------------- bookings
  app.get('/api/v1/orgs/:orgId/room-bookings', viewer, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const query = parse(
      z
        .object({
          from: z.iso.datetime({ offset: true }),
          to: z.iso.datetime({ offset: true }),
          roomId: z.uuid().optional(),
          mine: z.enum(['true', 'false']).optional(),
        })
        .refine((v) => Date.parse(v.to) > Date.parse(v.from), {
          message: 'Invalid range',
          path: ['to'],
        })
        .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= ROOM_LIMITS.maxRangeDays * DAY_MS, {
          message: 'The range is too long',
          path: ['to'],
        }),
      request.query,
    );
    let rows = ctx.db
      .selectFrom('room_bookings')
      .leftJoin('users', 'users.id', 'room_bookings.booked_by')
      .selectAll('room_bookings')
      .select('users.name as booked_by_name')
      .where('room_bookings.org_id', '=', org.id)
      .where('room_bookings.ends_at', '>', new Date(query.from))
      .where('room_bookings.starts_at', '<', new Date(query.to))
      .orderBy('room_bookings.starts_at')
      .limit(2000);
    if (query.roomId) rows = rows.where('room_bookings.room_id', '=', query.roomId);
    if (query.mine === 'true') rows = rows.where('room_bookings.booked_by', '=', user.id);
    const isAdmin = hasRole(org.role, 'ADMIN');
    return { bookings: (await rows.execute()).map((row) => bookingDto(row, user.id, isAdmin)) };
  });

  app.post('/api/v1/orgs/:orgId/room-bookings', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(bookingInputSchema, request.body);
    await loadRoom(org.id, body.roomId);
    const startsAt = new Date(body.startsAt);
    assertWhen(startsAt);
    let id: string;
    try {
      ({ id } = await ctx.db
        .insertInto('room_bookings')
        .values({
          org_id: org.id,
          room_id: body.roomId,
          starts_at: startsAt,
          ends_at: new Date(body.endsAt),
          title: body.title || null,
          booked_by: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow());
    } catch (error) {
      throw isOverlap(error) ? roomBusy() : error;
    }
    await audit(ctx.db, {
      action: 'room.booking_created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'room_booking',
      targetId: id,
      meta: { roomId: body.roomId },
    });
    await notifyRoomChanged(ctx, org.id, body.roomId);
    const booking = await loadBooking(org.id, id);
    return reply
      .status(201)
      .send({ booking: bookingDto(booking, user.id, hasRole(org.role, 'ADMIN')) });
  });

  app.patch('/api/v1/orgs/:orgId/room-bookings/:bookingId', viewer, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { bookingId } = parse(bookingParams, request.params);
    const body = parse(
      z
        .object({
          roomId: z.uuid().optional(),
          startsAt: z.iso.datetime({ offset: true }).optional(),
          endsAt: z.iso.datetime({ offset: true }).optional(),
          title: bookingTitleSchema.nullable().optional(),
        })
        .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    const booking = await loadBooking(org.id, bookingId);
    assertMayEdit(request, booking);
    const next = bookingInputSchema.safeParse({
      roomId: body.roomId ?? booking.room_id,
      startsAt: body.startsAt ?? new Date(booking.starts_at).toISOString(),
      endsAt: body.endsAt ?? new Date(booking.ends_at).toISOString(),
      title: body.title !== undefined ? body.title : booking.title,
    });
    if (!next.success) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        'Invalid booking',
        next.error.issues.map((issue) => ({ path: issue.path.join('.'), reason: 'invalid' })),
      );
    }
    if (next.data.roomId !== booking.room_id) await loadRoom(org.id, next.data.roomId);
    // Only a new start is checked: a meeting that already began can still be renamed or
    // extended (the dashboard always sends the start).
    const startsAt = new Date(next.data.startsAt);
    if (startsAt.getTime() !== new Date(booking.starts_at).getTime()) assertWhen(startsAt);
    try {
      await ctx.db
        .updateTable('room_bookings')
        .set({
          room_id: next.data.roomId,
          starts_at: new Date(next.data.startsAt),
          ends_at: new Date(next.data.endsAt),
          title: next.data.title || null,
          updated_at: new Date(),
        })
        .where('id', '=', bookingId)
        .where('org_id', '=', org.id)
        .execute();
    } catch (error) {
      throw isOverlap(error) ? roomBusy() : error;
    }
    await audit(ctx.db, {
      action: 'room.booking_updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'room_booking',
      targetId: bookingId,
      meta: { fields: Object.keys(body) },
    });
    await notifyRoomChanged(ctx, org.id, [booking.room_id, next.data.roomId]);
    const updated = await loadBooking(org.id, bookingId);
    return { booking: bookingDto(updated, user.id, hasRole(org.role, 'ADMIN')) };
  });

  app.delete('/api/v1/orgs/:orgId/room-bookings/:bookingId', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { bookingId } = parse(bookingParams, request.params);
    const booking = await loadBooking(org.id, bookingId);
    assertMayEdit(request, booking);
    await ctx.db
      .deleteFrom('room_bookings')
      .where('id', '=', bookingId)
      .where('org_id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'room.booking_deleted',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'room_booking',
      targetId: bookingId,
      meta: { roomId: booking.room_id, own: booking.booked_by === user.id },
    });
    await notifyRoomChanged(ctx, org.id, booking.room_id);
    return reply.status(204).send();
  });
}
