// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { calendarConfigSchema, parseWidgetConfig } from '@rubinny/shared';
import { CalendarParseError, parseCalendar } from '../../src/modules/widgets/calendar.js';

/** Sunday 1 November 2026, 09:00 in Jerusalem (07:00 UTC). */
const NOW = new Date('2026-11-01T07:00:00Z');

const JERUSALEM = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Jerusalem',
  'BEGIN:STANDARD',
  'DTSTART:19701025T020000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700327T020000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1FR',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
];

const ics = (...events: string[][]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//EN',
    'X-WR-CALNAME:מתנ"ס הגפן',
    ...JERUSALEM,
    ...events.flat(),
    'END:VCALENDAR',
  ].join('\r\n');

const event = (uid: string, lines: string[]) => [
  'BEGIN:VEVENT',
  `UID:${uid}`,
  'DTSTAMP:20261001T000000Z',
  ...lines,
  'END:VEVENT',
];

const days = (n: number) => calendarConfigSchema.parse({ url: 'https://x.example/c.ics', days: n });

describe('parseCalendar', () => {
  it('converts times with the calendar’s time zone and keeps the calendar name', () => {
    const data = parseCalendar(
      ics(
        event('a', [
          'SUMMARY:חוג ציור',
          'LOCATION:חדר 2',
          'DTSTART;TZID=Asia/Jerusalem:20261101T170000',
          'DTEND;TZID=Asia/Jerusalem:20261101T183000',
        ]),
      ),
      days(14),
      NOW,
    );
    expect(data).toEqual({
      title: 'מתנ"ס הגפן',
      events: [
        {
          title: 'חוג ציור',
          start: '2026-11-01T15:00:00.000Z',
          end: '2026-11-01T16:30:00.000Z',
          allDay: false,
          location: 'חדר 2',
        },
      ],
    });
  });

  it('expands weekly events with an exception and a cancelled date, inside the window only', () => {
    const data = parseCalendar(
      ics(
        event('yoga', [
          'SUMMARY:יוגה',
          'DTSTART;TZID=Asia/Jerusalem:20260105T190000',
          'DTEND;TZID=Asia/Jerusalem:20260105T200000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO',
          'EXDATE;TZID=Asia/Jerusalem:20261109T190000',
        ]),
        // This Monday's class moves to 20:00.
        event('yoga', [
          'SUMMARY:יוגה (שעה מיוחדת)',
          'RECURRENCE-ID;TZID=Asia/Jerusalem:20261102T190000',
          'DTSTART;TZID=Asia/Jerusalem:20261102T200000',
          'DTEND;TZID=Asia/Jerusalem:20261102T210000',
        ]),
      ),
      days(21),
      NOW,
    );
    expect(data.events.map((e) => [e.title, e.start])).toEqual([
      ['יוגה (שעה מיוחדת)', '2026-11-02T18:00:00.000Z'],
      // 9 November is excluded (EXDATE).
      ['יוגה', '2026-11-16T17:00:00.000Z'],
    ]);
  });

  it('keeps all-day events of today, drops finished and cancelled ones, sorts by start', () => {
    const data = parseCalendar(
      ics(
        event('later', ['SUMMARY:ערב הורים', 'DTSTART:20261103T160000Z', 'DTEND:20261103T180000Z']),
        event('day', [
          'SUMMARY:יום ספורט',
          'DTSTART;VALUE=DATE:20261101',
          'DTEND;VALUE=DATE:20261102',
        ]),
        event('past', ['SUMMARY:ישיבת בוקר', 'DTSTART:20261101T050000Z', 'DTEND:20261101T060000Z']),
        event('off', [
          'SUMMARY:בוטל',
          'STATUS:CANCELLED',
          'DTSTART:20261102T100000Z',
          'DTEND:20261102T110000Z',
        ]),
        event('far', ['SUMMARY:רחוק', 'DTSTART:20270101T100000Z', 'DTEND:20270101T110000Z']),
      ),
      days(14),
      NOW,
    );
    expect(data.events).toEqual([
      { title: 'יום ספורט', start: '2026-11-01', end: '2026-11-02', allDay: true, location: null },
      {
        title: 'ערב הורים',
        start: '2026-11-03T16:00:00.000Z',
        end: '2026-11-03T18:00:00.000Z',
        allDay: false,
        location: null,
      },
    ]);
  });

  it('keeps text only, without control characters, and bounds the work', () => {
    const data = parseCalendar(
      ics(
        event('x', [
          'SUMMARY:<b>Hi</b>\\nthere\u0007',
          'DTSTART:20261102T100000Z',
          'DTEND:20261102T110000Z',
        ]),
        // A daily event since 2000: expanded only up to the window, not from its start.
        event('daily', [
          'SUMMARY:Daily',
          'DTSTART:20000101T080000Z',
          'DTEND:20000101T081500Z',
          'RRULE:FREQ=DAILY',
        ]),
      ),
      days(3),
      NOW,
    );
    // Shown as text by the player (never HTML), so the tags are harmless characters.
    expect(data.events.find((e) => e.title.startsWith('<b>'))?.title).toBe('<b>Hi</b> there');
    expect(data.events.length).toBeLessThanOrEqual(200);
  });

  it('reaches today in series that started years ago, keeping their day and time', () => {
    const data = parseCalendar(
      ics(
        // Daily since 2000 (about 9,800 days before the window).
        event('daily', [
          'SUMMARY:Standup',
          'DTSTART:20000101T080000Z',
          'DTEND:20000101T081500Z',
          'RRULE:FREQ=DAILY',
        ]),
        // Every Monday and Wednesday at 18:00 Jerusalem time since 2005, across many
        // daylight saving changes.
        event('weekly', [
          'SUMMARY:Choir',
          'DTSTART;TZID=Asia/Jerusalem:20050103T180000',
          'DTEND;TZID=Asia/Jerusalem:20050103T190000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
        ]),
      ),
      days(3),
      NOW,
    );
    const titles = (name: string) => data.events.filter((e) => e.title === name);
    // Sunday 1 Nov 09:00 Jerusalem: today's standup (08:00Z = 10:00) and the next two days.
    expect(titles('Standup').map((e) => e.start)).toEqual([
      '2026-11-01T08:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
      '2026-11-03T08:00:00.000Z',
    ]);
    // Monday 2 Nov 18:00 in Jerusalem (UTC+2 in winter).
    expect(titles('Choir').map((e) => e.start)).toEqual(['2026-11-02T16:00:00.000Z']);
  });

  it("keeps today's all-day events in time zones west of UTC", () => {
    // 20:30 on 28 Oct in New York is already 29 Oct in UTC.
    const data = parseCalendar(
      ics(event('d', ['SUMMARY:Fair', 'DTSTART;VALUE=DATE:20261028', 'DTEND;VALUE=DATE:20261029'])),
      days(3),
      new Date('2026-10-29T00:30:00Z'),
    );
    expect(data.events.map((e) => e.title)).toEqual(['Fair']);
  });

  it("never lets one calendar's time zones change another's", () => {
    // A calendar defines "Europe/Berlin" as UTC+5 (wrong on purpose).
    const wrongBerlin = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Berlin',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0500',
      'TZOFFSETTO:+0500',
      'END:STANDARD',
      'END:VTIMEZONE',
      ...event('a', [
        'SUMMARY:A',
        'DTSTART;TZID=Europe/Berlin:20261102T100000',
        'DTEND;TZID=Europe/Berlin:20261102T110000',
      ]),
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseCalendar(wrongBerlin, days(3), NOW).events[0]!.start).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    // Another calendar uses the same TZID without defining it: it is not read with the
    // first calendar's rules (floating time, as before any calendar was read).
    const other = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      ...event('b', [
        'SUMMARY:B',
        'DTSTART;TZID=Europe/Berlin:20261102T100000',
        'DTEND;TZID=Europe/Berlin:20261102T110000',
      ]),
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseCalendar(other, days(3), NOW).events[0]!.start).not.toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('refuses what is not a calendar', () => {
    expect(() => parseCalendar('<html>nope</html>', days(14), NOW)).toThrow(CalendarParseError);
    expect(() => parseCalendar('BEGIN:VCARD\r\nEND:VCARD', days(14), NOW)).toThrow(
      CalendarParseError,
    );
  });

  it('accepts webcal links as https', () => {
    expect(parseWidgetConfig('calendar', { url: 'webcal://calendar.example/c.ics' })).toMatchObject(
      {
        success: true,
        config: { url: 'https://calendar.example/c.ics', view: 'agenda', maxEvents: 6, days: 14 },
      },
    );
    expect(parseWidgetConfig('calendar', { url: 'ftp://calendar.example/c.ics' }).success).toBe(
      false,
    );
  });
});
