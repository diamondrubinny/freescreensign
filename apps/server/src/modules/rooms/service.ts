// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { RoomStatusData, RoomStatusMeeting } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Db } from '../../db/database.js';
import { HttpError } from '../../lib/http-error.js';
import { afterCommit } from '../../lib/tenant.js';

/**
 * Meeting rooms (docs/phases/18-rooms-directory-calendar-zmanim.md): what a room's screen
 * shows, and telling the screens when a booking changes.
 */

/** PostgreSQL exclusion_violation: the no-overlap constraint of room_bookings. */
export const isOverlap = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23P01';

export const roomBusy = () =>
  new HttpError(409, 'ROOM_BUSY', 'The room is already booked at that time', [
    { path: 'startsAt', reason: 'overlap' },
  ]);

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_MAX = 5;

/**
 * The status a room's screen shows: never who booked (only the time, and the title when the
 * room allows it). `allowBooking` is the widget's setting.
 */
export async function roomStatus(
  db: Db,
  orgId: string,
  roomId: string,
  allowBooking: boolean,
): Promise<RoomStatusData> {
  const room = await db
    .selectFrom('rooms')
    .innerJoin('organizations', 'organizations.id', 'rooms.org_id')
    .select([
      'rooms.name',
      'rooms.location',
      'rooms.capacity',
      'rooms.show_titles',
      'organizations.room_pin_hash',
    ])
    .where('rooms.id', '=', roomId)
    .where('rooms.org_id', '=', orgId)
    .executeTakeFirst();
  if (!room) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');

  const now = new Date();
  const bookings = await db
    .selectFrom('room_bookings')
    .select(['id', 'starts_at', 'ends_at', 'title', 'screen_id'])
    .where('room_id', '=', roomId)
    .where('org_id', '=', orgId)
    .where('ends_at', '>', now)
    .where('starts_at', '<', new Date(now.getTime() + DAY_MS))
    .orderBy('starts_at')
    .limit(UPCOMING_MAX + 1)
    .execute();

  const meeting = (row: (typeof bookings)[number]): RoomStatusMeeting => ({
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    title: room.show_titles ? row.title : null,
    screenBookingId: row.screen_id ? row.id : null,
  });
  const currentRow = bookings.find((row) => new Date(row.starts_at) <= now) ?? null;
  return {
    room: { name: room.name, location: room.location, capacity: room.capacity },
    serverTime: now.toISOString(),
    current: currentRow ? meeting(currentRow) : null,
    upcoming: bookings
      .filter((row) => row !== currentRow)
      .slice(0, UPCOMING_MAX)
      .map(meeting),
    bookingEnabled: allowBooking && room.room_pin_hash !== null,
  };
}

/**
 * Tells every screen of the organization (screens without that room ignore it), after the
 * request's transaction commits, so a screen that fetches at once sees the change.
 */
export async function notifyRoomChanged(ctx: AppContext, orgId: string, roomId: string) {
  const screens = await ctx.db
    .selectFrom('screens')
    .select('id')
    .where('org_id', '=', orgId)
    .execute();
  await afterCommit(async () => {
    for (const screen of screens) {
      await ctx.events.publish(screen.id, { type: 'room.changed', roomId });
    }
  });
}
