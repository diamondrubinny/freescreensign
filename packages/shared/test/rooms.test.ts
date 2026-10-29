// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  bookingInputSchema,
  parseWidgetConfig,
  roomInputSchema,
  roomPinSchema,
  screenBookingSchema,
} from '../src/index.js';

const ROOM = '7d3e3b0e-8c43-4f43-9a52-2b2b3c1f0a11';

describe('room schemas', () => {
  it('fills room defaults and trims names', () => {
    expect(roomInputSchema.parse({ name: '  Board room ' })).toEqual({
      name: 'Board room',
      location: null,
      capacity: null,
      showTitles: false,
    });
    expect(roomInputSchema.safeParse({ name: '' }).success).toBe(false);
    expect(roomInputSchema.safeParse({ name: 'A', capacity: 0 }).success).toBe(false);
  });

  it('accepts bookings that end after they start, up to 12 hours', () => {
    const ok = bookingInputSchema.safeParse({
      roomId: ROOM,
      startsAt: '2026-11-01T09:00:00+02:00',
      endsAt: '2026-11-01T10:30:00+02:00',
    });
    expect(ok.success).toBe(true);
    expect(ok.data?.title).toBeNull();
    for (const [startsAt, endsAt] of [
      ['2026-11-01T10:00:00+02:00', '2026-11-01T10:00:00+02:00'],
      ['2026-11-01T10:00:00+02:00', '2026-11-01T09:00:00+02:00'],
      ['2026-11-01T08:00:00+02:00', '2026-11-01T20:00:01+02:00'],
      ['2026-11-01 09:00', '2026-11-01 10:00'],
    ]) {
      expect(bookingInputSchema.safeParse({ roomId: ROOM, startsAt, endsAt }).success).toBe(false);
    }
  });

  it('takes a new PIN of 6 to 8 digits, and only 15, 30 or 60 minutes at a screen', () => {
    expect(roomPinSchema.safeParse('123456').success).toBe(true);
    expect(roomPinSchema.safeParse(null).success).toBe(true);
    for (const pin of ['1234', '12345', '123456789', '12a456', ' 123456']) {
      expect(roomPinSchema.safeParse(pin).success).toBe(false);
    }
    expect(screenBookingSchema.safeParse({ minutes: 30, pin: '1234' }).success).toBe(true);
    expect(screenBookingSchema.safeParse({ minutes: 45, pin: '1234' }).success).toBe(false);
    expect(screenBookingSchema.safeParse({ minutes: 120, pin: '1234' }).success).toBe(false);
  });

  it('validates the room widget', () => {
    expect(parseWidgetConfig('room', { roomId: ROOM })).toEqual({
      success: true,
      config: { roomId: ROOM, allowBooking: true, locale: 'he', format: '24h' },
    });
    expect(parseWidgetConfig('room', { roomId: 'nope' }).success).toBe(false);
  });
});
