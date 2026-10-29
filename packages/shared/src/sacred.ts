// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';
import { HAVDALAH_METHODS, zmanimPlaceSchema } from './widgets.js';

/**
 * Scheduling by Shabbat and holidays (docs/phases/20-shabbat-holiday-scheduling.md). The
 * server computes when Shabbat and holidays begin and end for the organization's place (from
 * candle lighting to havdalah, with optional margins); screens get the coming periods with
 * their manifest and decide on their own clock, offline too. This module only describes and
 * evaluates periods; the calendar itself lives on the server.
 */

/** A rule shows only during Shabbat and holidays, or never during them. */
export const SACRED_MODES = ['only', 'skip'] as const;
export type SacredMode = (typeof SACRED_MODES)[number];

export const SACRED_LIMITS = {
  /** Days of periods sent to screens. */
  days: 60,
  maxPeriods: 40,
  maxOffsetMinutes: 180,
} as const;

/** The organization's settings: where, and how Shabbat begins and ends there. */
export const sacredSettingsSchema = z.object({
  place: zmanimPlaceSchema,
  /** Candle lighting, minutes before sunset (18 by custom; 40 in Jerusalem). */
  candleMinutes: z.number().int().min(0).max(60).default(18),
  havdalah: z.enum(HAVDALAH_METHODS).default('tzeit'),
  /** Start this long before candle lighting (e.g. to take ads down early). */
  startOffsetMinutes: z.number().int().min(0).max(SACRED_LIMITS.maxOffsetMinutes).default(0),
  /** End this long after havdalah. */
  endOffsetMinutes: z.number().int().min(0).max(SACRED_LIMITS.maxOffsetMinutes).default(0),
});
export type SacredSettings = z.infer<typeof sacredSettingsSchema>;

export const SACRED_KINDS = ['shabbat', 'holiday'] as const;

const instant = z.iso.datetime({ offset: true });

/** One Shabbat, holiday, or both back to back: [start, end). */
export const sacredPeriodSchema = z
  .object({
    start: instant,
    end: instant,
    kinds: z.array(z.enum(SACRED_KINDS)).min(1).max(2),
    /** Holiday names (in the organization's language), for the dashboard. */
    names: z.array(z.string().max(80)).max(6).default([]),
  })
  .refine((p) => Date.parse(p.start) < Date.parse(p.end), {
    message: 'start must be before end',
    path: ['end'],
  });
export type SacredPeriod = z.infer<typeof sacredPeriodSchema>;

/** The periods known up to `until` (after it, nothing is known: see sacredRuleActive). */
export const sacredTimesSchema = z.object({
  periods: z.array(sacredPeriodSchema).max(SACRED_LIMITS.maxPeriods),
  until: instant,
});
export type SacredTimes = z.infer<typeof sacredTimesSchema>;

/** The period containing `at` (ms), or null. */
export function sacredPeriodAt(times: SacredTimes, at: number): SacredPeriod | null {
  return times.periods.find((p) => Date.parse(p.start) <= at && at < Date.parse(p.end)) ?? null;
}

/**
 * Whether a rule's Shabbat condition allows it at `at` (ms). Without known times (no place
 * set, or a screen offline past `until`), "only" never shows and "skip" always does.
 */
export function sacredRuleActive(
  mode: SacredMode | null | undefined,
  at: number,
  times: SacredTimes | null | undefined,
): boolean {
  if (!mode) return true;
  const during =
    times !== null &&
    times !== undefined &&
    at < Date.parse(times.until) &&
    sacredPeriodAt(times, at) !== null;
  return mode === 'only' ? during : !during;
}
