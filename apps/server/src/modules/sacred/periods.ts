// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  CandleLightingEvent,
  HavdalahEvent,
  HebrewCalendar,
  HolidayEvent,
  Location,
  flags,
} from '@hebcal/core';
import {
  SACRED_LIMITS,
  addDays,
  localTime,
  zonedTime,
  type SacredPeriod,
  type SacredSettings,
  type SacredTimes,
} from '@rubinny/shared';

/**
 * When Shabbat and holidays begin and end for an organization's place
 * (docs/phases/20-shabbat-holiday-scheduling.md), with @hebcal/core (as the zmanim widget):
 * from candle lighting (minus the start margin) to havdalah (plus the end margin). A holiday
 * next to Shabbat (or a two-day holiday) is one period: candle lighting inside an open period
 * (the second night) does not start another one.
 *
 * Counted: Shabbat and holidays on which work is forbidden (Rosh Hashana, Yom Kippur, the
 * first and last days of Sukkot and Pesach, Shavuot; the second days outside Israel). Not
 * Chol HaMoed, Chanukah, Purim or fasts: hebcal lights no candles and makes no havdalah for
 * them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** No period lasts longer (Rosh Hashana followed by Shabbat: about two and a half days). */
const LONGEST_DAYS = 3;
const CACHE_SIZE = 200;
const cache = new Map<string, SacredTimes>();

/** A civil date (YYYY-MM-DD) as local noon, which @hebcal/core reads by its local fields. */
function civil(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const keyOf = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The periods from a few days ago to `days` ahead, known until `until`. */
export function computeSacredTimes(
  settings: SacredSettings,
  now = new Date(),
  days: number = SACRED_LIMITS.days,
): SacredTimes {
  const { place } = settings;
  const today = localTime(now, place.timezone).date;
  const cacheKey = `${JSON.stringify(settings)}|${today}|${String(days)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

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
  // From before the longest period that can still be running, to past the horizon by as much,
  // so every period that starts before `until` also ends inside the range.
  const firstKey = addDays(today, -LONGEST_DAYS);
  const lastKey = addDays(today, days + LONGEST_DAYS);
  const events = HebrewCalendar.calendar({
    start: civil(firstKey),
    end: civil(lastKey),
    location,
    il: place.israel,
    candlelighting: true,
    candleLightingMins: settings.candleMinutes,
    ...(settings.havdalah === 'tzeit' ? {} : { havdalahMins: Number(settings.havdalah) }),
    noModern: true,
  });
  const locale = place.israel ? 'he-x-NoNikud' : 'en';

  // Holidays on which work is forbidden, by civil date.
  const holidays = new Map<string, string[]>();
  for (const event of events) {
    if (!(event instanceof HolidayEvent) || (event.mask & flags.CHAG) === 0) continue;
    const key = keyOf(event.getDate().greg());
    holidays.set(key, [...(holidays.get(key) ?? []), event.render(locale)]);
  }

  const edges = events
    .filter(
      (event): event is CandleLightingEvent | HavdalahEvent =>
        event instanceof CandleLightingEvent || event instanceof HavdalahEvent,
    )
    .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
  const startMargin = settings.startOffsetMinutes * 60_000;
  const endMargin = settings.endOffsetMinutes * 60_000;
  const until = zonedTime(addDays(today, days), 0, place.timezone);

  const periods: SacredPeriod[] = [];
  let open: number | null = null;
  for (const edge of edges) {
    const at = edge.eventTime.getTime();
    if (edge instanceof CandleLightingEvent) {
      open ??= at - startMargin;
      continue;
    }
    // Havdalah without candle lighting before it: the period began before the range.
    if (open === null) continue;
    const start = open;
    const end = at + endMargin;
    open = null;
    if (end <= now.getTime() - DAY_MS || start >= until) continue;
    // What the period covers: Shabbat (a Saturday in it) and the holidays of its days.
    const kinds = new Set<'shabbat' | 'holiday'>();
    const names: string[] = [];
    const lastDate = localTime(new Date(end), place.timezone).date;
    for (let date = localTime(new Date(start), place.timezone).date; date <= lastDate;) {
      // The days themselves, not their eves: a day counts when the period reaches its noon.
      const noon = zonedTime(date, 12 * 60, place.timezone);
      if (noon >= start && noon < end) {
        if (localTime(new Date(noon), place.timezone).day === 6) kinds.add('shabbat');
        for (const name of holidays.get(date) ?? []) {
          kinds.add('holiday');
          if (!names.includes(name)) names.push(name);
        }
      }
      date = addDays(date, 1);
    }
    if (kinds.size === 0) kinds.add('shabbat');
    periods.push({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      kinds: [...kinds],
      names: names.slice(0, 6),
    });
  }

  const times = {
    periods: periods.slice(0, SACRED_LIMITS.maxPeriods),
    until: new Date(until).toISOString(),
  };
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value ?? '');
  cache.set(cacheKey, times);
  return times;
}
