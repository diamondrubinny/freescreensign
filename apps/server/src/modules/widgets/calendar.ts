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
 * source is at most 1 MB (safeFetch), recurrences are expanded only inside the window, and
 * at most MAX_OCCURRENCES are produced in all.
 */

export class CalendarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarParseError';
  }
}

const MAX_EVENTS = 200;
const MAX_OCCURRENCES = 2000;
/** Iterations of one recurring event (a daily rule from years ago skips its past quickly). */
const MAX_ITERATIONS = 5000;
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

  // The calendar's own time zones, so TZID times convert correctly.
  for (const zone of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // A malformed zone: its times are read as UTC/floating.
    }
  }

  // Window: from the start of today (UTC, so all-day events of today stay) to `days` ahead.
  const from = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
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
  let produced = 0;
  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    produced++;
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
    if (produced >= MAX_OCCURRENCES) break;
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    let iterator: ICAL.RecurExpansion;
    try {
      iterator = event.iterator();
    } catch {
      continue;
    }
    for (let i = 0; i < MAX_ITERATIONS && produced < MAX_OCCURRENCES; i++) {
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
