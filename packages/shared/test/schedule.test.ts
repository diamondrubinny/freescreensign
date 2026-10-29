// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  dayTimeline,
  isLocalDate,
  localTime,
  manifestV1Schema,
  ruleActiveAt,
  scheduleEntryInputSchema,
  scheduleInputSchema,
  unusedRules,
  weekStart,
  weekTimeline,
  winningRule,
  type LocalTime,
} from '../src/index.js';

const LAYOUT = '11111111-1111-4111-8111-111111111111';
const PLAYLIST = '22222222-2222-4222-8222-222222222222';

// 2026-10-15 is a Thursday (day 4).
const at = (date: string, hhmm: string): LocalTime => ({
  date,
  day: dayOfWeek(date),
  minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)),
});

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('26-01-01')).toBe(false);
  });

  it('adds days across months and years, and finds the week start', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayOfWeek('2026-10-15')).toBe(4);
    expect(weekStart('2026-10-15')).toBe('2026-10-11');
    expect(weekStart('2026-10-11')).toBe('2026-10-11');
  });

  it('reads the wall clock of a time zone, including across DST', () => {
    expect(localTime(new Date('2026-10-15T21:30:00Z'), 'Asia/Jerusalem')).toEqual({
      date: '2026-10-16',
      day: 5,
      minutes: 30,
      at: Date.parse('2026-10-15T21:30:00Z'),
    });
    // Israel is UTC+2 in winter: 2026-12-01 10:00 UTC → 12:00.
    expect(localTime(new Date('2026-12-01T10:00:00Z'), 'Asia/Jerusalem').minutes).toBe(12 * 60);
  });
});

describe('ruleActiveAt', () => {
  it('treats a rule without conditions as always active', () => {
    expect(ruleActiveAt({}, at('2026-10-15', '03:00'))).toBe(true);
  });

  it('checks days, inclusive date ranges and time windows', () => {
    const rule = {
      daysOfWeek: [0, 1, 2, 3, 4],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-15',
      timeFrom: '08:00',
      timeTo: '12:00',
    };
    expect(ruleActiveAt(rule, at('2026-10-15', '08:00'))).toBe(true);
    expect(ruleActiveAt(rule, at('2026-10-15', '11:59'))).toBe(true);
    expect(ruleActiveAt(rule, at('2026-10-15', '12:00'))).toBe(false);
    expect(ruleActiveAt(rule, at('2026-10-15', '07:59'))).toBe(false);
    expect(ruleActiveAt(rule, at('2026-10-16', '09:00'))).toBe(false); // Friday, and after dateTo
    expect(ruleActiveAt(rule, at('2026-09-30', '09:00'))).toBe(false); // before dateFrom
  });

  it('assigns the after-midnight part of a window to the day it started', () => {
    const fridayNight = { daysOfWeek: [5], timeFrom: '22:00', timeTo: '02:00' };
    expect(ruleActiveAt(fridayNight, at('2026-10-16', '23:00'))).toBe(true); // Friday 23:00
    expect(ruleActiveAt(fridayNight, at('2026-10-17', '01:30'))).toBe(true); // Saturday 01:30
    expect(ruleActiveAt(fridayNight, at('2026-10-17', '02:00'))).toBe(false);
    expect(ruleActiveAt(fridayNight, at('2026-10-16', '01:30'))).toBe(false); // Thursday's tail
    expect(ruleActiveAt(fridayNight, at('2026-10-16', '12:00'))).toBe(false);

    const lastNight = { dateTo: '2026-10-16', timeFrom: '22:00', timeTo: '02:00' };
    expect(ruleActiveAt(lastNight, at('2026-10-17', '01:00'))).toBe(true);
    expect(ruleActiveAt(lastNight, at('2026-10-17', '23:00'))).toBe(false);
  });

  it('lets the first enabled active rule win', () => {
    const rules = [
      { timeFrom: '09:00', timeTo: '10:00', enabled: false },
      { timeFrom: '09:00', timeTo: '10:00' },
      {},
    ];
    expect(winningRule(rules, at('2026-10-15', '09:30'))).toBe(1);
    expect(winningRule(rules, at('2026-10-15', '11:00'))).toBe(2);
    expect(winningRule([], at('2026-10-15', '11:00'))).toBeNull();
  });
});

describe('weekly timeline', () => {
  const rules = [
    { timeFrom: '12:00', timeTo: '13:00', daysOfWeek: [4] }, // Thursday lunch promo
    { timeFrom: '06:00', timeTo: '11:00' }, // breakfast
    { timeFrom: '11:00', timeTo: '15:00' }, // lunch
    { timeFrom: '07:00', timeTo: '08:00' }, // always hidden by breakfast
  ];

  it('splits a day into exact segments', () => {
    expect(dayTimeline(rules, '2026-10-15')).toEqual([
      { from: 0, to: 360, rule: null },
      { from: 360, to: 660, rule: 1 },
      { from: 660, to: 720, rule: 2 },
      { from: 720, to: 780, rule: 0 },
      { from: 780, to: 900, rule: 2 },
      { from: 900, to: 1440, rule: null },
    ]);
    expect(dayTimeline([], '2026-10-15')).toEqual([{ from: 0, to: 1440, rule: null }]);
  });

  it('shows a window crossing midnight on both days', () => {
    const [thu, fri] = weekTimeline(
      [{ daysOfWeek: [4], timeFrom: '22:00', timeTo: '02:00' }],
      '2026-10-15',
    );
    expect(thu?.segments).toEqual([
      { from: 0, to: 1320, rule: null },
      { from: 1320, to: 1440, rule: 0 },
    ]);
    expect(fri?.segments).toEqual([
      { from: 0, to: 120, rule: 0 },
      { from: 120, to: 1440, rule: null },
    ]);
  });

  it('reports enabled rules that never show', () => {
    const week = weekTimeline(rules, '2026-10-11');
    expect(week.map((d) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(unusedRules(rules, week)).toEqual([3]);
    const outOfRange = [{ dateFrom: '2027-01-01' }, { enabled: false }];
    expect(unusedRules(outOfRange, weekTimeline(outOfRange, '2026-10-11'))).toEqual([0]);
  });
});

describe('scheduleEntryInputSchema', () => {
  const valid = { name: 'Breakfast', layoutId: LAYOUT };

  it('applies defaults and normalizes days', () => {
    const parsed = scheduleEntryInputSchema.parse({ ...valid, daysOfWeek: [5, 0, 5] });
    expect(parsed).toMatchObject({
      playlistId: null,
      daysOfWeek: [0, 5],
      timeFrom: null,
      dateFrom: null,
      enabled: true,
    });
  });

  it('requires exactly one kind of content', () => {
    expect(scheduleEntryInputSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(
      scheduleEntryInputSchema.safeParse({ name: 'x', layoutId: LAYOUT, playlistId: PLAYLIST })
        .success,
    ).toBe(false);
    expect(scheduleEntryInputSchema.safeParse({ name: 'x', playlistId: PLAYLIST }).success).toBe(
      true,
    );
  });

  it('rejects inconsistent dates and times', () => {
    const bad = [
      { dateFrom: '2026-10-02', dateTo: '2026-10-01' },
      { dateFrom: '2026-02-30' },
      { timeFrom: '08:00' },
      { timeFrom: '08:00', timeTo: '08:00' },
      { timeFrom: '24:00', timeTo: '08:00' },
      { daysOfWeek: [7] },
      { name: '   ' },
    ];
    for (const patch of bad) {
      expect(
        scheduleEntryInputSchema.safeParse({ ...valid, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
    expect(
      scheduleEntryInputSchema.safeParse({ ...valid, timeFrom: '22:00', timeTo: '02:00' }).success,
    ).toBe(true);
  });

  it('limits the number of entries', () => {
    const entries = Array.from({ length: 101 }, () => valid);
    expect(scheduleInputSchema.safeParse({ name: 'S', entries }).success).toBe(false);
    expect(scheduleInputSchema.parse({ name: 'S' }).entries).toEqual([]);
  });
});

describe('manifest schedule entries', () => {
  it('accepts local dates and rejects reversed ones', () => {
    const base = {
      schemaVersion: 1,
      version: 'v',
      generatedAt: '2026-10-15T00:00:00Z',
      screen: { id: 's', name: 'S', timezone: 'UTC', orientation: 'landscape' },
      media: [],
      widgets: [],
      playlists: [],
      layouts: [
        {
          id: 'l',
          width: 10,
          height: 10,
          zones: [{ id: 'z', x: 0, y: 0, w: 10, h: 10, z: 0, playlistId: null }],
        },
      ],
    };
    const entry = {
      id: 'e',
      layoutId: 'l',
      priority: 1,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    };
    expect(
      manifestV1Schema.safeParse({ ...base, schedule: { defaultLayoutId: 'l', entries: [entry] } })
        .success,
    ).toBe(true);
    expect(
      manifestV1Schema.safeParse({
        ...base,
        schedule: { defaultLayoutId: 'l', entries: [{ ...entry, dateFrom: '2026-11-01' }] },
      }).success,
    ).toBe(false);
  });
});
