// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { sacredSettingsSchema, type SacredPeriod } from '@rubinny/shared';
import { computeSacredTimes } from '../src/modules/sacred/periods.js';

const jerusalem = (extra: object = {}) =>
  sacredSettingsSchema.parse({
    place: {
      name: 'ירושלים',
      latitude: 31.76904,
      longitude: 35.21633,
      timezone: 'Asia/Jerusalem',
      israel: true,
    },
    candleMinutes: 40,
    ...extra,
  });

const newYork = sacredSettingsSchema.parse({
  place: {
    name: 'New York',
    latitude: 40.71427,
    longitude: -74.00597,
    timezone: 'America/New_York',
    israel: false,
  },
  candleMinutes: 18,
});

/** "YYYY-MM-DD HH:MM" of an instant in a zone. */
const local = (iso: string, timeZone = 'Asia/Jerusalem') =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

const span = (p: SacredPeriod, timeZone?: string) =>
  `${local(p.start, timeZone)} → ${local(p.end, timeZone)}`;

describe('Shabbat and holiday periods', () => {
  it('runs from candle lighting to havdalah (hebcal.com: Jerusalem, Chayei Sarah 5787)', () => {
    const times = computeSacredTimes(jerusalem(), new Date('2026-11-04T10:00:00Z'), 14);
    const first = times.periods[0]!;
    expect(span(first)).toBe('2026-11-06 16:05 → 2026-11-07 17:23');
    expect(first.kinds).toEqual(['shabbat']);
    expect(first.names).toEqual([]);
    // Two weeks: two Shabbatot, known until midnight 14 days ahead.
    expect(times.periods).toHaveLength(2);
    expect(local(times.until)).toBe('2026-11-18 00:00');
  });

  it('applies the margins and the havdalah method', () => {
    const times = computeSacredTimes(
      jerusalem({ startOffsetMinutes: 30, endOffsetMinutes: 15, havdalah: '72' }),
      new Date('2026-11-04T10:00:00Z'),
      7,
    );
    const first = times.periods[0]!;
    // 16:05 - 30 min; Saturday's sunset (16:44) + 72 min (rounded up, as hebcal.com) + 15.
    expect(local(first.start)).toBe('2026-11-06 15:35');
    expect(local(first.end)).toBe('2026-11-07 18:12');
  });

  it('joins Rosh Hashana and the Shabbat next to it into one period', () => {
    // Rosh Hashana 5787 is on Saturday and Sunday, 12–13 September 2026.
    const times = computeSacredTimes(jerusalem(), new Date('2026-09-08T10:00:00Z'), 21);
    const rosh = times.periods.find((p) => p.kinds.includes('holiday'))!;
    expect(local(rosh.start).slice(0, 10)).toBe('2026-09-11');
    expect(local(rosh.end).slice(0, 10)).toBe('2026-09-13');
    expect(rosh.kinds.sort()).toEqual(['holiday', 'shabbat']);
    expect(rosh.names.join(' ')).toMatch(/ראש השנה/);
    // Yom Kippur (Monday 21 September), on its own.
    const kippur = times.periods.find((p) => local(p.start).startsWith('2026-09-20'))!;
    expect(local(kippur.end).slice(0, 10)).toBe('2026-09-21');
    expect(kippur.kinds).toEqual(['holiday']);
    expect(kippur.names.join(' ')).toMatch(/כיפור/);
  });

  it('counts one day of Pesach in Israel and two abroad, and not Chol HaMoed', () => {
    // Pesach 5787 begins on the evening of Wednesday 21 April 2027.
    const now = new Date('2027-04-18T12:00:00Z');
    const israel = computeSacredTimes(jerusalem(), now, 14).periods.filter((p) =>
      p.kinds.includes('holiday'),
    );
    expect(israel.map((p) => span(p))).toEqual([
      expect.stringMatching(/^2027-04-21 .* → 2027-04-22 /),
      // The seventh day (Wednesday 28 April).
      expect.stringMatching(/^2027-04-27 .* → 2027-04-28 /),
    ]);
    const abroad = computeSacredTimes(newYork, now, 14).periods.filter((p) =>
      p.kinds.includes('holiday'),
    );
    // Two days at the start (Thursday–Friday, then Shabbat: one period to Saturday night) and
    // two at the end.
    expect(span(abroad[0]!, 'America/New_York')).toMatch(/^2027-04-21 .* → 2027-04-24 /);
    expect(abroad[0]!.kinds.sort()).toEqual(['holiday', 'shabbat']);
    expect(span(abroad[1]!, 'America/New_York')).toMatch(/^2027-04-27 .* → 2027-04-29 /);
  });

  it('includes the period that is running now', () => {
    // Saturday morning in Jerusalem.
    const times = computeSacredTimes(jerusalem(), new Date('2026-11-07T08:00:00Z'), 7);
    expect(span(times.periods[0]!)).toBe('2026-11-06 16:05 → 2026-11-07 17:23');
  });
});
