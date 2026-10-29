// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';

/**
 * Meeting rooms and their bookings (docs/phases/18-rooms-directory-calendar-zmanim.md),
 * shared by the server, the dashboard and the player.
 */
export const ROOM_LIMITS = {
  maxRoomsPerOrg: 200,
  /** The longest booking. */
  maxBookingHours: 12,
  /** How far ahead a booking may start. */
  maxDaysAhead: 365,
  /** The widest range one listing may ask for. */
  maxRangeDays: 31,
  /** Bookings made at a screen ("Book now"). */
  screenMinutes: [15, 30, 60] as const,
} as const;

export const roomNameSchema = z.string().trim().min(1).max(80);

export const roomInputSchema = z.object({
  name: roomNameSchema,
  location: z.string().trim().max(120).nullable().default(null),
  capacity: z.number().int().min(1).max(1000).nullable().default(null),
  /** Meeting titles are shown on the room's screen (off: "Busy" only). */
  showTitles: z.boolean().default(false),
});
export type RoomInput = z.infer<typeof roomInputSchema>;

export const bookingTitleSchema = z.string().trim().max(120);

/** A booking made in the dashboard; times are ISO 8601 with an offset. */
export const bookingInputSchema = z
  .object({
    roomId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    title: bookingTitleSchema.nullable().default(null),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: 'The end must be after the start',
    path: ['endsAt'],
  })
  .refine(
    (v) => Date.parse(v.endsAt) - Date.parse(v.startsAt) <= ROOM_LIMITS.maxBookingHours * 3_600_000,
    {
      message: `A booking may last up to ${String(ROOM_LIMITS.maxBookingHours)} hours`,
      path: ['endsAt'],
    },
  );
export type BookingInput = z.infer<typeof bookingInputSchema>;

/**
 * The organization's PIN for booking at a screen: 6–8 digits (a 4-digit PIN could be guessed
 * at a screen in days; security review, finding C2), or null to turn it off. Screens still
 * accept a shorter PIN set before 0.11 until an admin changes it.
 */
export const roomPinSchema = z
  .string()
  .regex(/^\d{6,8}$/, 'Expected 6 to 8 digits')
  .nullable();

/** "Book now" at a screen. */
export const screenBookingSchema = z.object({
  minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  pin: z.string().regex(/^\d{4,8}$/),
});

export const screenBookingEndSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
});

// ---- Room widget data (GET /player/v1/widgets/:id/data for a room widget) -------------

export interface RoomStatusMeeting {
  startsAt: string;
  endsAt: string;
  /** Only when the room shows titles. */
  title: string | null;
  /** Set when the meeting was booked at a screen, so it can be ended there. */
  screenBookingId: string | null;
}

export interface RoomStatusData {
  room: { name: string; location: string | null; capacity: number | null };
  serverTime: string;
  current: RoomStatusMeeting | null;
  /** The next meetings in the coming 24 hours (up to 5). */
  upcoming: RoomStatusMeeting[];
  /** True when the organization has a PIN and the widget allows booking. */
  bookingEnabled: boolean;
}
