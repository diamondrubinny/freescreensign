// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  activeLayoutId,
  dayTimeline,
  itemWindowSchema,
  localTime,
  normalizeWindow,
  parseManifest,
  sacredRuleActive,
  sacredSettingsSchema,
  scheduleEntryInputSchema,
  windowActive,
  zonedTime,
  type ManifestV1,
  type SacredTimes,
} from '../src/index.js';

/** Shabbat Chayei Sarah 5787 in Jerusalem: candles 16:05 on Friday, havdalah 17:23 Saturday. */
const SHABBAT: SacredTimes = {
  periods: [
    {
      start: '2026-11-06T14:05:00.000Z',
      end: '2026-11-07T15:23:00.000Z',
      kinds: ['shabbat'],
      names: [],
    },
  ],
  until: '2026-12-31T00:00:00.000Z',
};
const at = (iso: string) => Date.parse(iso);
const TZ = 'Asia/Jerusalem';

describe('Shabbat and holiday rules', () => {
  it('shows "only" rules inside a period and "skip" rules outside it, end excluded', () => {
    expect(sacredRuleActive(null, at('2026-11-06T15:00:00Z'), SHABBAT)).toBe(true);
    expect(sacredRuleActive('only', at('2026-11-06T14:04:59Z'), SHABBAT)).toBe(false);
    expect(sacredRuleActive('only', at('2026-11-06T14:05:00Z'), SHABBAT)).toBe(true);
    expect(sacredRuleActive('only', at('2026-11-07T15:22:59Z'), SHABBAT)).toBe(true);
    expect(sacredRuleActive('only', at('2026-11-07T15:23:00Z'), SHABBAT)).toBe(false);
    expect(sacredRuleActive('skip', at('2026-11-06T15:00:00Z'), SHABBAT)).toBe(false);
    expect(sacredRuleActive('skip', at('2026-11-08T10:00:00Z'), SHABBAT)).toBe(true);
  });

  it('without known times, "only" never shows and "skip" always does', () => {
    const during = at('2026-11-06T15:00:00Z');
    expect(sacredRuleActive('only', during, null)).toBe(false);
    expect(sacredRuleActive('skip', during, undefined)).toBe(true);
    // Past the horizon (a screen offline for weeks): unknown, even inside an old period.
    const stale = { ...SHABBAT, until: '2026-11-06T00:00:00Z' };
    expect(sacredRuleActive('only', during, stale)).toBe(false);
    expect(sacredRuleActive('skip', during, stale)).toBe(true);
    // An unknown moment (NaN) is not inside anything.
    expect(sacredRuleActive('only', Number.NaN, SHABBAT)).toBe(false);
  });

  it('combines with hours: "Shabbat morning only" (Saturday 08:00–12:00 local)', () => {
    const window = itemWindowSchema.parse({
      timeFrom: '08:00',
      timeTo: '12:00',
      sacred: 'only',
    });
    expect(windowActive(window, new Date('2026-11-07T07:00:00Z'), TZ, SHABBAT)).toBe(true);
    // Friday 09:00: right hours, not Shabbat yet.
    expect(windowActive(window, new Date('2026-11-06T07:00:00Z'), TZ, SHABBAT)).toBe(false);
    // Saturday 13:00: Shabbat, wrong hours.
    expect(windowActive(window, new Date('2026-11-07T11:00:00Z'), TZ, SHABBAT)).toBe(false);
  });

  it('keeps the condition in windows and entries, and treats it as a condition', () => {
    expect(normalizeWindow(itemWindowSchema.parse({ sacred: 'skip' }))).toMatchObject({
      sacred: 'skip',
    });
    expect(normalizeWindow(itemWindowSchema.parse({}))).toBeNull();
    const entry = scheduleEntryInputSchema.parse({
      name: 'Shabbat',
      playlistId: '7d3e3b0e-8c43-4f43-9a52-2b2b3c1f0a11',
      sacred: 'only',
    });
    expect(entry.sacred).toBe('only');
    expect(
      scheduleEntryInputSchema.safeParse({ name: 'x', playlistId: entry.playlistId, sacred: 'x' })
        .success,
    ).toBe(false);
  });

  it('validates the organization settings with defaults', () => {
    const settings = sacredSettingsSchema.parse({
      place: { name: 'ירושלים', latitude: 31.77, longitude: 35.21, timezone: TZ },
      candleMinutes: 40,
    });
    expect(settings).toMatchObject({
      havdalah: 'tzeit',
      startOffsetMinutes: 0,
      endOffsetMinutes: 0,
      place: { israel: true },
    });
    expect(sacredSettingsSchema.safeParse({ ...settings, startOffsetMinutes: 500 }).success).toBe(
      false,
    );
  });
});

describe('wall clock to moment', () => {
  it('converts a local time in a zone, across daylight saving', () => {
    // Summer (UTC+3) and winter (UTC+2) in Jerusalem.
    expect(new Date(zonedTime('2026-07-01', 600, TZ)).toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    expect(new Date(zonedTime('2026-11-06', 965, TZ)).toISOString()).toBe(
      '2026-11-06T14:05:00.000Z',
    );
    expect(new Date(zonedTime('2026-11-06', 0, 'America/New_York')).toISOString()).toBe(
      '2026-11-06T05:00:00.000Z',
    );
    // Round trip.
    const local = localTime(new Date(zonedTime('2026-03-29', 7 * 60 + 30, TZ)), TZ);
    expect(local).toMatchObject({ date: '2026-03-29', minutes: 450 });
  });
});

describe('timeline with Shabbat', () => {
  const rules = [
    { sacred: 'only' as const, enabled: true },
    { daysOfWeek: [5], enabled: true },
  ];
  const sacred = { times: SHABBAT, timeZone: TZ };

  it('switches exactly at candle lighting and at havdalah', () => {
    // Friday: the Friday rule until 16:05, Shabbat from 16:05.
    expect(dayTimeline(rules, '2026-11-06', sacred)).toEqual([
      { from: 0, to: 965, rule: 1 },
      { from: 965, to: 1440, rule: 0 },
    ]);
    // Saturday: Shabbat until 17:23, then the default.
    expect(dayTimeline(rules, '2026-11-07', sacred)).toEqual([
      { from: 0, to: 1043, rule: 0 },
      { from: 1043, to: 1440, rule: null },
    ]);
    // Without the periods, "only" rules never win.
    expect(dayTimeline(rules, '2026-11-07')).toEqual([{ from: 0, to: 1440, rule: null }]);
  });
});

describe('manifest', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const zone = (n: number) => ({ id: id(n), x: 0, y: 0, w: 10, h: 10, z: 0, playlistId: null });
  const manifest = (extra: object = {}): ManifestV1 => {
    const parsed = parseManifest({
      schemaVersion: 1,
      version: 'v',
      generatedAt: '2026-11-06T00:00:00Z',
      screen: { id: id(1), name: 'S', timezone: TZ, orientation: 'landscape' },
      media: [],
      widgets: [],
      playlists: [],
      layouts: [
        { id: id(2), width: 10, height: 10, background: '#000000', zones: [zone(5)] },
        { id: id(3), width: 10, height: 10, background: '#000000', zones: [zone(6)] },
      ],
      schedule: {
        defaultLayoutId: id(2),
        entries: [{ id: id(4), layoutId: id(3), priority: 1, sacred: 'only' }],
      },
      ...extra,
    });
    if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
    return parsed.manifest;
  };

  it('uses the periods it carries to pick the layout', () => {
    const shabbat = new Date('2026-11-07T08:00:00Z');
    expect(activeLayoutId(manifest({ sacredTimes: SHABBAT }), shabbat)).toBe(id(3));
    expect(
      activeLayoutId(manifest({ sacredTimes: SHABBAT }), new Date('2026-11-08T08:00:00Z')),
    ).toBe(id(2));
    // No periods in the manifest: "only" never applies.
    expect(activeLayoutId(manifest(), shabbat)).toBe(id(2));
  });
});
