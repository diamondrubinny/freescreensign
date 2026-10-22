// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';
import { hour23, hourOf } from './time.js';

/**
 * Scheduling: which content a screen shows when.
 *
 * Rules are evaluated on the screen's local wall clock (its time zone), so one schedule
 * behaves correctly on screens in different zones. Shared by the server (validation),
 * the CMS (forms and the weekly timeline) and the player (what to show now).
 */

export const SCHEDULE_LIMITS = {
  maxEntries: 100,
  maxSchedulesPerOrg: 200,
} as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD form. */
export function isLocalDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const localDateSchema = z
  .string()
  .refine(isLocalDate, { message: 'Expected a date (YYYY-MM-DD)' });
export const timeOfDaySchema = z.string().regex(TIME_RE, 'Expected HH:MM (24h)');

/** The conditions of a schedule entry. Every field is optional; missing means "always". */
export interface ScheduleRule {
  dateFrom?: string | null | undefined;
  dateTo?: string | null | undefined;
  /** 0 = Sunday … 6 = Saturday. Empty or missing means every day. */
  daysOfWeek?: readonly number[] | null | undefined;
  timeFrom?: string | null | undefined;
  timeTo?: string | null | undefined;
}

/** Dates, days of week and hours: the fields a schedule entry and a playlist item share. */
const ruleFields = {
  dateFrom: localDateSchema.nullable().default(null),
  dateTo: localDateSchema.nullable().default(null),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([])
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  timeFrom: timeOfDaySchema.nullable().default(null),
  timeTo: timeOfDaySchema.nullable().default(null),
};

function checkRule(
  rule: {
    dateFrom: string | null;
    dateTo: string | null;
    timeFrom: string | null;
    timeTo: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (rule.dateFrom && rule.dateTo && rule.dateFrom > rule.dateTo) {
    ctx.addIssue({
      code: 'custom',
      message: 'dateFrom must not be after dateTo',
      path: ['dateTo'],
    });
  }
  if ((rule.timeFrom === null) !== (rule.timeTo === null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'timeFrom and timeTo must be provided together',
      path: ['timeTo'],
    });
  } else if (rule.timeFrom !== null && rule.timeFrom === rule.timeTo) {
    ctx.addIssue({ code: 'custom', message: 'The time window is empty', path: ['timeTo'] });
  }
}

export const scheduleEntryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    layoutId: z.uuid().nullable().default(null),
    playlistId: z.uuid().nullable().default(null),
    ...ruleFields,
    enabled: z.boolean().default(true),
  })
  .superRefine((entry, ctx) => {
    if ((entry.layoutId === null) === (entry.playlistId === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a layout or a playlist',
        path: ['layoutId'],
      });
    }
    checkRule(entry, ctx);
  });

/**
 * When a playlist item is shown (all optional): between two dates, on some days of the week,
 * between two times. Evaluated by the player on the screen's wall clock, so it works offline.
 */
export const itemWindowSchema = z.object(ruleFields).superRefine(checkRule);
export type ItemWindow = z.infer<typeof itemWindowSchema>;

/** A window without any condition means "always": stored and sent as no window at all. */
export function normalizeWindow(window: ItemWindow | null | undefined): ItemWindow | null {
  if (!window) return null;
  const empty =
    !window.dateFrom &&
    !window.dateTo &&
    window.daysOfWeek.length === 0 &&
    !window.timeFrom &&
    !window.timeTo;
  return empty ? null : window;
}

/** Whether an item with this window shows at `now` on a screen in `timeZone`. */
export function windowActive(
  window: ScheduleRule | null | undefined,
  now: Date,
  timeZone: string,
): boolean {
  return !window || ruleActiveAt(window, localTime(now, timeZone));
}

/** The window is over for good on `date` (YYYY-MM-DD, local): it will never show again. */
export function windowEnded(window: ScheduleRule | null | undefined, date: string): boolean {
  if (!window?.dateTo) return false;
  // A window crossing midnight still shows early on the day after its last date.
  const crossesMidnight =
    window.timeFrom && window.timeTo && toMinutes(window.timeFrom) > toMinutes(window.timeTo);
  return date > (crossesMidnight ? addDays(window.dateTo, 1) : window.dateTo);
}

export type ScheduleEntryInput = z.infer<typeof scheduleEntryInputSchema>;

export const scheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  entries: z.array(scheduleEntryInputSchema).max(SCHEDULE_LIMITS.maxEntries).default([]),
});

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

// ---------------------------------------------------------------------------
// Local wall-clock evaluation
// ---------------------------------------------------------------------------

/** A moment on a screen's wall clock. */
export interface LocalTime {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  /** Minutes since local midnight (0–1439). */
  minutes: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const pad = (n: number) => String(n).padStart(2, '0');

function deviceLocalTime(now: Date): LocalTime {
  return {
    date: `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    day: now.getDay(),
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

/** The wall-clock time in `timeZone`. Unknown zones fall back to the device clock. */
export function localTime(now: Date, timeZone: string): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      ...hour23(),
    }).formatToParts(now);
  } catch {
    return deviceLocalTime(now);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = WEEKDAYS[get('weekday')];
  if (day === undefined) return deviceLocalTime(now);
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    day,
    minutes: hourOf(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return `${String(result.getUTCFullYear())}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

/** Day of week (0 = Sunday) of a YYYY-MM-DD date. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Sunday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

export const toMinutes = (hhmm: string): number =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** HH:MM for minutes since midnight; 1440 (end of day) is "24:00". */
export const formatMinutes = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * Whether a rule is active at a local time. A time window that crosses midnight
 * (22:00–02:00) belongs to the day it starts on: its dates and days of week are
 * checked against that day.
 */
export function ruleActiveAt(rule: ScheduleRule, at: LocalTime): boolean {
  let { date, day } = at;
  if (rule.timeFrom && rule.timeTo) {
    const from = toMinutes(rule.timeFrom);
    const to = toMinutes(rule.timeTo);
    if (from < to) {
      if (at.minutes < from || at.minutes >= to) return false;
    } else if (at.minutes < to) {
      // The early-morning tail of yesterday's window.
      date = addDays(at.date, -1);
      day = (at.day + 6) % 7;
    } else if (at.minutes < from) {
      return false;
    }
  }
  if (rule.dateFrom && date < rule.dateFrom) return false;
  if (rule.dateTo && date > rule.dateTo) return false;
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(day)) {
    return false;
  }
  return true;
}

/** Index of the first (highest-priority) enabled rule active at `at`, or null. */
export function winningRule(
  rules: readonly (ScheduleRule & { enabled?: boolean })[],
  at: LocalTime,
): number | null {
  const index = rules.findIndex((rule) => rule.enabled !== false && ruleActiveAt(rule, at));
  return index === -1 ? null : index;
}

// ---------------------------------------------------------------------------
// Weekly timeline (CMS)
// ---------------------------------------------------------------------------

export interface TimelineSegment {
  /** Minutes since midnight, inclusive. */
  from: number;
  /** Minutes since midnight, exclusive (1440 = end of day). */
  to: number;
  /** Winning rule index, or null for the screen's default content. */
  rule: number | null;
}

export interface TimelineDay {
  date: string;
  day: number;
  segments: TimelineSegment[];
}

/**
 * What plays on a date, as consecutive segments covering the whole day. Rules are in
 * priority order (index 0 wins). Exact: activity only changes at midnight and at the
 * rules' own window boundaries.
 */
export function dayTimeline(
  rules: readonly (ScheduleRule & { enabled?: boolean })[],
  date: string,
): TimelineSegment[] {
  const bounds = new Set<number>([0]);
  for (const rule of rules) {
    if (rule.timeFrom && rule.timeTo) {
      bounds.add(toMinutes(rule.timeFrom));
      bounds.add(toMinutes(rule.timeTo));
    }
  }
  const starts = [...bounds].filter((m) => m < 1440).sort((a, b) => a - b);
  const day = dayOfWeek(date);
  const segments: TimelineSegment[] = [];
  starts.forEach((from, i) => {
    const to = starts[i + 1] ?? 1440;
    const rule = winningRule(rules, { date, day, minutes: from });
    const last = segments[segments.length - 1];
    if (last && last.rule === rule) last.to = to;
    else segments.push({ from, to, rule });
  });
  return segments;
}

/** Seven days starting on `start` (normally a Sunday). */
export function weekTimeline(
  rules: readonly (ScheduleRule & { enabled?: boolean })[],
  start: string,
): TimelineDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, day: dayOfWeek(date), segments: dayTimeline(rules, date) };
  });
}

/** Enabled rules that never win during these days (hidden by a higher rule, or out of dates). */
export function unusedRules(
  rules: readonly (ScheduleRule & { enabled?: boolean })[],
  days: readonly TimelineDay[],
): number[] {
  const used = new Set(days.flatMap((d) => d.segments.map((s) => s.rule)));
  return rules.flatMap((rule, index) =>
    rule.enabled !== false && !used.has(index) ? [index] : [],
  );
}
