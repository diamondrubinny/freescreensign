// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  CandleLightingEvent,
  HavdalahEvent,
  HDate,
  HebrewCalendar,
  HolidayEvent,
  Location,
  ParshaEvent,
  Zmanim,
  flags,
} from '@hebcal/core';
import type { WidgetConfig, ZmanimData, ZmanimDay, ZmanKey } from '@rubinny/shared';

/*
 * Synagogue times for the zmanim widget, computed on the server with @hebcal/core
 * (GPL-2.0-or-later, the library behind hebcal.com): no outside service is called. Screens get
 * the coming days at once, so they keep showing correct times offline. Halachic accuracy needs
 * a rabbi's review (docs/phases/18-rooms-directory-calendar-zmanim.md); the screen names the
 * method it uses.
 */

export const ZMANIM_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type ZmanimConfig = WidgetConfig<'zmanim'>;

/** "YYYY-MM-DD" of `date` in `timeZone`. */
function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The zone's offset from UTC in ms at `utc` (positive east of Greenwich). */
function zoneOffset(utc: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) -
    utc
  );
}

/** A local clock time ("HH:MM") of a day in the zone, as an instant. */
function localInstant(key: string, time: string, timeZone: string): Date {
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const guess = Date.parse(`${key}T00:00:00Z`) + (hh * 60 + mm) * 60_000;
  // Two passes: the offset at the guessed instant, then at the corrected one (DST days).
  const first = guess - zoneOffset(guess, timeZone);
  return new Date(guess - zoneOffset(first, timeZone));
}

const iso = (date: Date | null) =>
  date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

/** The coming days (today in the place's time zone first) with everything the widget shows. */
export function computeZmanim(config: ZmanimConfig, now = new Date()): ZmanimData {
  const { place } = config;
  const location = new Location(
    place.latitude,
    place.longitude,
    place.israel,
    place.timezone,
    place.name,
    undefined,
    undefined,
    place.elevation ?? 0,
  );
  const locale = config.locale === 'he' ? 'he-x-NoNikud' : 'en';
  // Days are keyed by their civil date in the place's time zone. @hebcal/core reads a Date's
  // local fields (year, month, day), so each day is passed as local noon of that date, which
  // is right whatever the server's own time zone is.
  const firstKey = dayKey(now, place.timezone);
  const firstNoon = Date.parse(`${firstKey}T12:00:00Z`);
  const keys = Array.from({ length: ZMANIM_DAYS }, (_, i) =>
    new Date(firstNoon + i * DAY_MS).toISOString().slice(0, 10),
  );
  const lastKey = new Date(firstNoon + (ZMANIM_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  const civil = (key: string) => {
    const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const keyOf = (date: Date) =>
    `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // Candle lighting, havdalah, holidays and Torah portions of the whole period at once.
  const events = HebrewCalendar.calendar({
    start: civil(firstKey),
    end: civil(lastKey),
    location,
    il: place.israel,
    candlelighting: true,
    candleLightingMins: config.candleMinutes,
    ...(config.havdalah === 'tzeit' ? {} : { havdalahMins: Number(config.havdalah) }),
    sedrot: config.showParasha,
    noModern: true,
  });
  const byDay = new Map<string, typeof events>();
  for (const event of events) {
    const key = keyOf(event.getDate().greg());
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }

  // The week's portion (read on the coming Shabbat) shows all week.
  const parashaOf = (index: number): string | null => {
    for (const key of keys.slice(index, index + 7)) {
      const found = (byDay.get(key) ?? []).find((e) => e instanceof ParshaEvent);
      if (found) return found.render(locale);
    }
    return null;
  };

  const days: ZmanimDay[] = keys.map((key, index) => {
    const date = civil(key);
    const zmanim = new Zmanim(location, date, place.elevation !== undefined);
    const zman = (k: ZmanKey): Date | null => {
      try {
        const value = k === 'tzeit' ? zmanim.tzeit(8.5) : zmanim[k]();
        return Number.isNaN(value.getTime()) ? null : value;
      } catch {
        // Polar day or night: no such time.
        return null;
      }
    };
    const weekday = date.getDay();
    const dayEvents = byDay.get(key) ?? [];
    const candles = dayEvents.find((e) => e instanceof CandleLightingEvent);
    const havdalah = dayEvents.find((e) => e instanceof HavdalahEvent);
    const holidays = dayEvents
      .filter(
        (e) =>
          e instanceof HolidayEvent &&
          // Major and minor holidays, fasts, Rosh Chodesh; not special Shabbatot or omer.
          (e.mask &
            (flags.CHAG |
              flags.MINOR_HOLIDAY |
              flags.MAJOR_FAST |
              flags.MINOR_FAST |
              flags.ROSH_CHODESH |
              flags.EREV)) !==
            0,
      )
      .map((e) => e.render(locale));
    return {
      date: key,
      hebrewDate:
        config.locale === 'he'
          ? new HDate(date).renderGematriya(true)
          : new HDate(date).render('en', true),
      parasha: config.showParasha ? parashaOf(index) : null,
      holidays: [...new Set(holidays)],
      times: config.times.map((k) => ({ key: k, at: iso(zman(k)) })),
      prayers: config.prayers
        .filter((p) => p.days.length === 0 || p.days.includes(weekday))
        .map((p) => {
          if (p.time !== undefined) {
            return { name: p.name, at: iso(localInstant(key, p.time, place.timezone)) };
          }
          const base = p.zman ? zman(p.zman) : null;
          return {
            name: p.name,
            at: iso(base ? new Date(base.getTime() + p.offset * 60_000) : null),
          };
        }),
      candles: candles instanceof CandleLightingEvent ? iso(candles.eventTime) : null,
      havdalah: havdalah instanceof HavdalahEvent ? iso(havdalah.eventTime) : null,
    };
  });

  return {
    place: { name: place.name, timezone: place.timezone },
    days,
    method: {
      candleMinutes: config.candleMinutes,
      havdalah: config.havdalah,
    },
  };
}
