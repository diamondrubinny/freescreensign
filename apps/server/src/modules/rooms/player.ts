// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { roomConfigSchema, screenBookingEndSchema, screenBookingSchema } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Screen } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { verifyAgainstDummy, verifyPassword } from '../../lib/password.js';
import { parse } from '../../lib/validation.js';
import { requireScreen } from '../player/auth.js';
import { buildManifest } from '../player/manifest.js';
import { isOverlap, notifyRoomChanged, roomBusy } from './service.js';

/**
 * Booking at a room's screen ("Book now", docs/phases/18-rooms-directory-calendar-zmanim.md).
 * The only writes a player makes besides its own reports, so they are narrow: the screen's
 * current content must show this room with booking allowed, the organization's PIN must be
 * right (attempts are limited per screen and per organization), and a booking starts now
 * and lasts 15, 30 or 60 minutes.
 */

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const bookingOff = () =>
  new HttpError(403, 'BOOKING_DISABLED', 'Booking at this screen is not available');
const wrongPin = () => new HttpError(403, 'WRONG_PIN', 'The PIN is not correct');

/**
 * The room, when the screen's content includes a room widget for it that allows booking.
 * Anything else is "not found", so a screen cannot probe other rooms or organizations.
 */
async function bookableRoom(ctx: AppContext, screen: Screen, roomId: string) {
  const room = await ctx.db
    .selectFrom('rooms')
    .innerJoin('organizations', 'organizations.id', 'rooms.org_id')
    .select(['rooms.id', 'organizations.room_pin_hash'])
    .where('rooms.id', '=', roomId)
    .where('rooms.org_id', '=', screen.org_id)
    .executeTakeFirst();
  if (!room) throw notFound();
  const manifest = await buildManifest(ctx.db, screen, ctx.env);
  const shown = manifest.widgets.some((widget) => {
    if (widget.type !== 'room') return false;
    const config = roomConfigSchema.safeParse(widget.config);
    return config.success && config.data.roomId === roomId && config.data.allowBooking;
  });
  if (!shown) throw notFound();
  if (room.room_pin_hash === null) throw bookingOff();
  return { id: room.id, pinHash: room.room_pin_hash };
}

/**
 * Counts an attempt against the limits. Runs before anything else, so repeated attempts are
 * refused before they cost a manifest build or a hash.
 */
async function countAttempt(ctx: AppContext, screen: Screen) {
  await ctx.limiter.hit(LIMITS.roomPinScreen, screen.id);
  await ctx.limiter.hit(LIMITS.roomPinOrg, screen.org_id);
}

/** Checks the PIN (after countAttempt); a correct PIN clears the failure counts. */
async function checkPin(ctx: AppContext, screen: Screen, pinHash: string, pin: string) {
  if (await verifyPassword(pinHash, pin)) {
    await ctx.limiter.reset(LIMITS.roomPinScreen, screen.id);
    await ctx.limiter.reset(LIMITS.roomPinOrg, screen.org_id);
    return;
  }
  await audit(ctx.db, {
    action: 'room.pin_failed',
    orgId: screen.org_id,
    targetType: 'screen',
    targetId: screen.id,
  });
  throw wrongPin();
}

export function playerRoomRoutes(app: FastifyInstance, ctx: AppContext) {
  const roomParams = z.object({ roomId: z.uuid() });

  app.post('/player/v1/rooms/:roomId/bookings', async (request, reply) => {
    const screen = await requireScreen(ctx, request);
    const { roomId } = parse(roomParams, request.params);
    const body = parse(screenBookingSchema, request.body);
    await countAttempt(ctx, screen);
    let room;
    try {
      room = await bookableRoom(ctx, screen, roomId);
    } catch (error) {
      // The same time as a PIN check, so the answer does not tell which rooms exist.
      await verifyAgainstDummy(body.pin);
      throw error;
    }
    await checkPin(ctx, screen, room.pinHash, body.pin);
    await ctx.limiter.hit(LIMITS.roomBookScreen, screen.id);

    // From the start of this minute, or from the end of a meeting that ended during it ("End
    // now" a moment ago), so the two do not overlap.
    const now = new Date();
    let startsAt = new Date(now);
    startsAt.setSeconds(0, 0);
    const ended = await ctx.db
      .selectFrom('room_bookings')
      .select((eb) => eb.fn.max('ends_at').as('endsAt'))
      .where('room_id', '=', room.id)
      .where('ends_at', '>', startsAt)
      .where('ends_at', '<=', now)
      .executeTakeFirst();
    if (ended?.endsAt) startsAt = new Date(ended.endsAt);
    const endsAt = new Date(Date.now() + body.minutes * 60_000);
    endsAt.setSeconds(0, 0);
    let id: string;
    try {
      ({ id } = await ctx.db
        .insertInto('room_bookings')
        .values({
          org_id: screen.org_id,
          room_id: room.id,
          starts_at: startsAt,
          ends_at: endsAt,
          title: null,
          booked_by: null,
          screen_id: screen.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow());
    } catch (error) {
      throw isOverlap(error) ? roomBusy() : error;
    }
    await audit(ctx.db, {
      action: 'room.booking_created',
      orgId: screen.org_id,
      targetType: 'room_booking',
      targetId: id,
      meta: { roomId: room.id, screenId: screen.id, minutes: body.minutes },
    });
    await notifyRoomChanged(ctx, screen.org_id, room.id);
    return reply.status(201).send({
      booking: { id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    });
  });

  /** Ends a meeting booked at a screen now (frees the room); only screen bookings. */
  app.post('/player/v1/rooms/:roomId/bookings/:bookingId/end', async (request, reply) => {
    const screen = await requireScreen(ctx, request);
    const { roomId, bookingId } = parse(
      z.object({ roomId: z.uuid(), bookingId: z.uuid() }),
      request.params,
    );
    const body = parse(screenBookingEndSchema, request.body);
    await countAttempt(ctx, screen);
    let room;
    try {
      room = await bookableRoom(ctx, screen, roomId);
    } catch (error) {
      await verifyAgainstDummy(body.pin);
      throw error;
    }
    await checkPin(ctx, screen, room.pinHash, body.pin);
    const booking = await ctx.db
      .selectFrom('room_bookings')
      .select(['id', 'starts_at', 'ends_at'])
      .where('id', '=', bookingId)
      .where('room_id', '=', room.id)
      .where('org_id', '=', screen.org_id)
      .where('screen_id', 'is not', null)
      .where('ends_at', '>', new Date())
      .executeTakeFirst();
    if (!booking) throw notFound();
    const now = new Date();
    if (new Date(booking.starts_at) >= now) {
      await ctx.db.deleteFrom('room_bookings').where('id', '=', booking.id).execute();
    } else {
      await ctx.db
        .updateTable('room_bookings')
        .set({ ends_at: now, updated_at: now })
        .where('id', '=', booking.id)
        .execute();
    }
    await audit(ctx.db, {
      action: 'room.booking_updated',
      orgId: screen.org_id,
      targetType: 'room_booking',
      targetId: booking.id,
      meta: { roomId: room.id, screenId: screen.id, ended: true },
    });
    await notifyRoomChanged(ctx, screen.org_id, room.id);
    return reply.status(204).send();
  });
}
