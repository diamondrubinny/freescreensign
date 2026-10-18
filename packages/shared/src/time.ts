import { z } from 'zod';

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Converts a wall-clock time ("2026-12-14T18:00") in `timeZone` to a Date.
 * Handles DST: the offset is re-evaluated at the resulting instant.
 */
export function zonedDateTime(local: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new RangeError('Expected YYYY-MM-DDTHH:MM');
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let result = guess - zoneOffset(guess, timeZone);
  result = guess - zoneOffset(result, timeZone);
  return new Date(result);
}

/** Splits a duration into days, hours, minutes and seconds (never negative). */
export function splitDuration(ms: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Whether the runtime knows this IANA time zone ("Asia/Jerusalem", "UTC"). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A screen's time zone, stored in its canonical spelling ("asia/jerusalem" → "Asia/Jerusalem"). */
export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isTimeZone, { message: 'Unknown time zone' })
  .transform(
    (value) => new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone,
  );

/** The time zones to offer in a list (the runtime's list, or a short fallback). */
export function timeZoneOptions(): string[] {
  // Missing in browsers before 2022.
  const zones =
    'supportedValuesOf' in Intl
      ? Intl.supportedValuesOf('timeZone')
      : ['Asia/Jerusalem', 'Europe/London'];
  return zones.includes('UTC') ? zones : [...zones, 'UTC'];
}
