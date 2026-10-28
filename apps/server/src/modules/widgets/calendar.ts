// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import ICAL from 'ical.js';
import type { CalendarData, CalendarEvent, WidgetConfig } from '@rubinny/shared';

/**
 * Upcoming events of an iCal (.ics) calendar, for the calendar widget: recurring events are
 * expanded (with their exceptions and cancellations), times are resolved with the calendar's
 * own time zones, and only text is kept (titles and locations, trimmed). Bounded work: the
 * source is at most 1 MB (safeFetch), recurrences stop at the end of the window, at most
 * MAX_OCCURRENCES are kept, and expansion takes at most MAX_STEPS steps in all.
 */

export class CalendarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarParseError';
  }
}

const MAX_EVENTS = 200;
/** Occurrences inside the window, in all. */
const MAX_OCCURRENCES = 2000;
/** Steps of one recurring series: a daily series from 13 years ago still reaches today. */
const MAX_ITERATIONS = 5000;
/** Steps of all series together (a file full of old series stays cheap). */
const MAX_STEPS = 100_000;
/** Time zones that ical.js knows itself; a calendar never replaces them. */
const BUILT_IN_ZONES = new Set(['UTC', 'Z', 'GMT']);
const MAX_TEXT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What ICAL.Event#getOccurrenceDetails returns (its type definition is incomplete). */
interface Occurrence {
  item: ICAL.Event;
  startDate: ICAL.Time;
  endDate: ICAL.Time;
}

const clean = (value: unknown): string =>
  typeof value === 'string'
    ? value
        // Control characters (other than line breaks, which become spaces) never reach screens.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT)
    : '';

/** All-day events are dates (YYYY-MM-DD); timed events are instants. */
function stamp(time: ICAL.Time): string {
  if (time.isDate) {
    return `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  return time.toJSDate().toISOString();
}

/** The instant an event's time stands for (all-day: its date at UTC midnight, for ordering). */
function instant(time: ICAL.Time): number {
  if (time.isDate) return Date.UTC(time.year, time.month - 1, time.day);
  return time.toJSDate().getTime();
}

/**
 * A later start for a long-running daily or weekly series: a whole number of periods ahead,
 * a week before the window, so the iterator does not walk years of past occurrences. Whole
 * periods keep the weekday and the time of day (in the event's zone, so across daylight
 * saving too). Not for a series with COUNT (it counts from the first occurrence) or with
 * several rules or BYSETPOS, which keep their own start.
 */
function laterStart(event: ICAL.Event, fromMs: number): ICAL.Time | undefined {
  const [property, ...more] = event.component.getAllProperties('rrule');
  if (!property || more.length > 0) return undefined;
  const rule = property.getFirstValue();
  if (!(rule instanceof ICAL.Recur) || rule.count) return undefined;
  if (rule.parts.BYSETPOS) return undefined;
  const unit = rule.freq === 'DAILY' ? 1 : rule.freq === 'WEEKLY' ? 7 : 0;
  if (unit === 0) return undefined;
  const period = unit * Math.max(rule.interval, 1);
  const start = event.startDate;
  const behind = Math.floor((fromMs - instant(start)) / DAY_MS) - 7;
  const periods = Math.floor(behind / period);
  if (periods <= 0) return undefined;
  const later = start.clone();
  later.adjust(periods * period, 0, 0, 0);
  return later;
}

export function parseCalendar(
  text: string,
  config: Pick<WidgetConfig<'calendar'>, 'days'>,
  now = new Date(),
): CalendarData {
  let root: ICAL.Component;
  try {
    const parsed: unknown = ICAL.parse(text);
    if (!Array.isArray(parsed)) throw new CalendarParseError('Not an iCal calendar');
    root = new ICAL.Component(parsed);
  } catch {
    throw new CalendarParseError('Not an iCal calendar');
  }
  if (root.name !== 'vcalendar') throw new CalendarParseError('Not an iCal calendar');

  // The calendar's own time zones, so TZID times convert correctly. ical.js keeps zones in
  // one registry for the whole process: they are registered for this (synchronous) parse
  // only and removed after it, so one calendar's zones never change another's times.
  const registered: string[] = [];
  try {
    for (const zone of root.getAllSubcomponents('vtimezone')) {
      const tzid = zone.getFirstPropertyValue('tzid');
      if (
        typeof tzid !== 'string' ||
        !tzid ||
        BUILT_IN_ZONES.has(tzid) ||
        ICAL.TimezoneService.has(tzid)
      )
        continue;
      try {
        ICAL.TimezoneService.register(zone);
        registered.push(tzid);
      } catch {
        // A malformed zone: its times are read as UTC/floating.
      }
    }
    return expand(root, config, now);
  } finally {
    for (const tzid of registered) ICAL.TimezoneService.remove(tzid);
  }
}

function expand(
  root: ICAL.Component,
  config: Pick<WidgetConfig<'calendar'>, 'days'>,
  now: Date,
): CalendarData {
  // Window: from 24 hours ago (so today's all-day events stay in every time zone; screens
  // drop what is over in their own) to `days` ahead.
  const from = now.getTime() - DAY_MS;
  const to = now.getTime() + config.days * DAY_MS;
  const nowMs = now.getTime();

  // Exceptions (RECURRENCE-ID) belong to their series; the series itself is the master.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const component of root.getAllSubcomponents('vevent')) {
    // An event without a start is invalid (RFC 5545) and skipped.
    if (!component.hasProperty('dtstart')) continue;
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(component);
    } catch {
      continue;
    }
    if (event.isRecurrenceException()) exceptions.push(event);
    else masters.set(event.uid || `#${String(masters.size)}`, event);
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) {
      master.relateException(exception);
    } else {
      // A lone exception (its series is not in this file): a single event.
      masters.set(`#x${String(masters.size)}`, exception);
    }
  }

  const events: CalendarEvent[] = [];
  let steps = 0;
  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    const status = clean(item.component.getFirstPropertyValue('status')).toUpperCase();
    if (status === 'CANCELLED') return;
    const startMs = instant(start);
    // All-day events end at midnight (exclusive): an event "today" ends after today.
    const endMs = Math.max(instant(end), startMs + (start.isDate ? DAY_MS : 0));
    if (endMs <= from || startMs >= to) return;
    // Finished timed events of today are gone; all-day ones stay for the whole day.
    if (!start.isDate && endMs <= nowMs) return;
    events.push({
      title: clean(item.summary) || '—',
      start: stamp(start),
      end: stamp(end),
      allDay: start.isDate,
      location: clean(item.location) || null,
    });
  };

  for (const event of masters.values()) {
    if (events.length >= MAX_OCCURRENCES || steps >= MAX_STEPS) break;
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    let iterator: ICAL.RecurExpansion;
    try {
      iterator = event.iterator(laterStart(event, from));
    } catch {
      continue;
    }
    for (
      let i = 0;
      i < MAX_ITERATIONS && steps < MAX_STEPS && events.length < MAX_OCCURRENCES;
      i++, steps++
    ) {
      let next: ICAL.Time;
      try {
        next = iterator.next();
      } catch {
        break;
      }
      // At the end of the series next() returns null and sets `complete`.
      if (iterator.complete) break;
      if (instant(next) >= to) break;
      let details: Occurrence;
      try {
        details = event.getOccurrenceDetails(next);
      } catch {
        continue;
      }
      add(details.item, details.startDate, details.endDate);
    }
  }

  const sortKey = (e: CalendarEvent) =>
    e.allDay ? Date.parse(`${e.start}T00:00:00Z`) - 1 : Date.parse(e.start);
  events.sort((a, b) => sortKey(a) - sortKey(b) || a.title.localeCompare(b.title));
  const name = clean(root.getFirstPropertyValue('x-wr-calname'));
  return { title: name || null, events: events.slice(0, MAX_EVENTS) };
}
