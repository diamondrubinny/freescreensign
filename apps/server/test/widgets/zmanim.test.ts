// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { zmanimConfigSchema } from '@rubinny/shared';
import { ZMANIM_DAYS, computeZmanim } from '../../src/modules/widgets/zmanim.js';

/** Friday 6 November 2026, 09:00 in Jerusalem (07:00 UTC). */
const NOW = new Date('2026-11-06T07:00:00Z');

const jerusalem = (extra: Record<string, unknown> = {}, elevation?: number) =>
  zmanimConfigSchema.parse({
    place: {
      ...(elevation === undefined ? {} : { elevation }),
      name: 'ירושלים',
      latitude: 31.76904,
      longitude: 35.21633,
      timezone: 'Asia/Jerusalem',
      israel: true,
    },
    candleMinutes: 40,
    ...extra,
  });

/** "HH:MM" of an instant in Jerusalem. */
const hhmm = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(iso))
    : null;

describe('computeZmanim', () => {
  it('computes the day in the place and matches hebcal.com for Jerusalem', () => {
    const data = computeZmanim(jerusalem(), NOW);
    expect(data.place).toEqual({ name: 'ירושלים', timezone: 'Asia/Jerusalem' });
    expect(data.days).toHaveLength(ZMANIM_DAYS);
    const today = data.days[0]!;
    expect(today.date).toBe('2026-11-06');
    expect(today.hebrewDate).toBe('כ״ו חשון תשפ״ז');
    expect(today.parasha).toBe('פרשת חיי שרה');
    const at = (key: string) => hhmm(today.times.find((t) => t.key === key)?.at);
    expect(at('sunrise')).toBe('05:59');
    expect(at('sunset')).toBe('16:45');
    expect(at('sofZmanShma')).toBe('08:40');
    expect(at('tzeit')).toBe('17:23');
    // Friday: candle lighting 40 minutes before sunset (Jerusalem custom); havdalah on Shabbat.
    expect(hhmm(today.candles)).toBe('16:05');
    expect(today.havdalah).toBeNull();
    const shabbat = data.days[1]!;
    expect(shabbat.date).toBe('2026-11-07');
    expect(shabbat.candles).toBeNull();
    expect(hhmm(shabbat.havdalah)).not.toBeNull();
    expect(data.method).toEqual({ candleMinutes: 40, havdalah: 'tzeit' });
  });

  it('uses the elevation for sunrise and sunset when it is set', () => {
    const sea = computeZmanim(jerusalem(), NOW).days[0]!;
    const high = computeZmanim(jerusalem({}, 786), NOW).days[0]!;
    const at = (day: typeof sea, key: string) =>
      Date.parse(day.times.find((t) => t.key === key)!.at!);
    expect(at(high, 'sunrise')).toBeLessThan(at(sea, 'sunrise'));
    expect(at(high, 'sunset')).toBeGreaterThan(at(sea, 'sunset'));
  });

  it('starts from the date in the place, not in UTC', () => {
    // 23:30 UTC on the 5th is already the 6th in Jerusalem.
    const data = computeZmanim(jerusalem(), new Date('2026-11-05T23:30:00Z'));
    expect(data.days[0]!.date).toBe('2026-11-06');
  });

  it('places prayers at fixed times or relative to a time of the day, on their days', () => {
    const data = computeZmanim(
      jerusalem({
        prayers: [
          { name: 'שחרית', time: '06:30' },
          { name: 'מנחה', zman: 'sunset', offset: -15 },
          { name: 'קבלת שבת', days: [5], zman: 'sunset', offset: 0 },
        ],
      }),
      NOW,
    );
    const friday = data.days[0]!;
    expect(friday.prayers.map((p) => [p.name, hhmm(p.at)])).toEqual([
      ['שחרית', '06:30'],
      ['מנחה', '16:30'],
      ['קבלת שבת', '16:45'],
    ]);
    // Saturday: no "Kabbalat Shabbat".
    expect(data.days[1]!.prayers.map((p) => p.name)).toEqual(['שחרית', 'מנחה']);
  });

  it('keeps fixed prayer times on the clock across a daylight saving change', () => {
    // Israel moves the clocks back on 25 October 2026; the window crosses it.
    const data = computeZmanim(
      jerusalem({ prayers: [{ name: 'שחרית', time: '06:30' }] }),
      new Date('2026-10-20T07:00:00Z'),
    );
    for (const day of data.days) expect(hhmm(day.prayers[0]!.at)).toBe('06:30');
  });

  it('uses fixed havdalah minutes and English when set, and lists holidays', () => {
    const data = computeZmanim(
      jerusalem({ havdalah: '72', locale: 'en' }),
      // Wednesday 9 December 2026: Chanukah begins on the evening of 4 December.
      new Date('2026-12-09T07:00:00Z'),
    );
    expect(data.days[0]!.hebrewDate).toMatch(/Kislev, 5787/);
    expect(data.days[0]!.holidays.some((h) => /Chanukah/.test(h))).toBe(true);
    const saturday = data.days.find((d) => d.date === '2026-12-12')!;
    const sunset = saturday.times.find((t) => t.key === 'sunset')!.at!;
    expect(Date.parse(saturday.havdalah!) - Date.parse(sunset)).toBeGreaterThanOrEqual(71 * 60_000);
    expect(data.method.havdalah).toBe('72');
  });

  it('leaves out the portion when disabled, and gives null for times that do not occur', () => {
    const data = computeZmanim(
      zmanimConfigSchema.parse({
        place: {
          name: 'Tromsø',
          latitude: 69.65,
          longitude: 18.96,
          timezone: 'Europe/Oslo',
          israel: false,
        },
        showParasha: false,
      }),
      // Polar night: the sun does not rise.
      new Date('2026-12-15T10:00:00Z'),
    );
    expect(data.days[0]!.parasha).toBeNull();
    expect(data.days[0]!.times.find((t) => t.key === 'sunrise')!.at).toBeNull();
  });
});
