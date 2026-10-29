// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  itemWindowSchema,
  normalizeWindow,
  playlistItemSchema,
  windowActive,
  windowEnded,
} from '../src/index.js';

const parse = (input: unknown) => itemWindowSchema.parse(input);

describe('playlist item windows', () => {
  it('validates like a schedule entry and normalizes "always" to no window', () => {
    expect(parse({})).toEqual({
      dateFrom: null,
      dateTo: null,
      daysOfWeek: [],
      timeFrom: null,
      timeTo: null,
      sacred: null,
    });
    expect(normalizeWindow(parse({}))).toBeNull();
    expect(normalizeWindow(null)).toBeNull();
    expect(normalizeWindow(parse({ daysOfWeek: [5, 0, 5] }))).toMatchObject({
      daysOfWeek: [0, 5],
    });
    expect(
      itemWindowSchema.safeParse({ dateFrom: '2026-10-20', dateTo: '2026-10-19' }).success,
    ).toBe(false);
    expect(itemWindowSchema.safeParse({ timeFrom: '08:00' }).success).toBe(false);
    expect(itemWindowSchema.safeParse({ timeFrom: '08:00', timeTo: '08:00' }).success).toBe(false);
    expect(itemWindowSchema.safeParse({ dateFrom: '2026-02-30' }).success).toBe(false);
    expect(itemWindowSchema.safeParse({ daysOfWeek: [7] }).success).toBe(false);
  });

  it('is evaluated on the screen’s wall clock', () => {
    // Weekdays 08:00-14:00 in Jerusalem (UTC+3 in October 2026).
    const window = parse({ daysOfWeek: [0, 1, 2, 3, 4], timeFrom: '08:00', timeTo: '14:00' });
    const tz = 'Asia/Jerusalem';
    // Thursday 2026-10-15.
    expect(windowActive(window, new Date('2026-10-15T05:00:00Z'), tz)).toBe(true); // 08:00
    expect(windowActive(window, new Date('2026-10-15T04:59:00Z'), tz)).toBe(false); // 07:59
    expect(windowActive(window, new Date('2026-10-15T11:00:00Z'), tz)).toBe(false); // 14:00
    // Friday.
    expect(windowActive(window, new Date('2026-10-16T06:00:00Z'), tz)).toBe(false);
    // The same moment is a different wall-clock time elsewhere.
    expect(windowActive(window, new Date('2026-10-15T05:00:00Z'), 'Europe/London')).toBe(false);
    expect(windowActive(null, new Date(), tz)).toBe(true);
  });

  it('includes both dates, and a night window ends the morning after its last date', () => {
    const tz = 'UTC';
    const days = parse({ dateFrom: '2026-10-20', dateTo: '2026-10-21' });
    expect(windowActive(days, new Date('2026-10-19T23:59:00Z'), tz)).toBe(false);
    expect(windowActive(days, new Date('2026-10-20T00:00:00Z'), tz)).toBe(true);
    expect(windowActive(days, new Date('2026-10-21T23:59:00Z'), tz)).toBe(true);
    expect(windowActive(days, new Date('2026-10-22T00:00:00Z'), tz)).toBe(false);
    expect(windowEnded(days, '2026-10-21')).toBe(false);
    expect(windowEnded(days, '2026-10-22')).toBe(true);

    const night = parse({ dateTo: '2026-10-21', timeFrom: '22:00', timeTo: '02:00' });
    expect(windowActive(night, new Date('2026-10-22T01:00:00Z'), tz)).toBe(true);
    expect(windowActive(night, new Date('2026-10-22T03:00:00Z'), tz)).toBe(false);
    expect(windowEnded(night, '2026-10-22')).toBe(false);
    expect(windowEnded(night, '2026-10-23')).toBe(true);
    expect(windowEnded(parse({ timeFrom: '08:00', timeTo: '09:00' }), '2099-01-01')).toBe(false);
  });

  it('travels in the manifest, optional for older content', () => {
    const item = { kind: 'media', ref: 'm', durationMs: 5000, transition: 'none' };
    expect(playlistItemSchema.parse(item).window).toBeUndefined();
    expect(playlistItemSchema.parse({ ...item, window: { daysOfWeek: [1] } }).window).toMatchObject(
      { daysOfWeek: [1] },
    );
    expect(playlistItemSchema.safeParse({ ...item, window: { timeFrom: '09:00' } }).success).toBe(
      false,
    );
  });
});
