import { describe, expect, it } from 'vitest';
import { hour23, hourOf, isTimeZone, timeZoneOptions, timeZoneSchema } from '../src/index.js';

describe('screen time zones', () => {
  it('accepts known zones in their canonical spelling, and nothing else', () => {
    expect(isTimeZone('Asia/Jerusalem')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(timeZoneSchema.parse(' asia/jerusalem ')).toBe('Asia/Jerusalem');
    expect(timeZoneSchema.parse('utc')).toBe('UTC');
    for (const bad of ['', 'Mars/Olympus', 'x'.repeat(65), '../etc/passwd']) {
      expect(timeZoneSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('offers the runtime’s zones, including UTC', () => {
    const zones = timeZoneOptions();
    expect(zones).toContain('Asia/Jerusalem');
    expect(zones).toContain('UTC');
    expect(zones.every(isTimeZone)).toBe(true);
  });
});

describe('24-hour clock on older engines', () => {
  it('uses hourCycle where supported, and reads "24" (hour12: false) as midnight', () => {
    expect(hour23()).toEqual({ hourCycle: 'h23' });
    // What engines before Chromium 73 get, and may print at midnight.
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date('2026-10-20T00:05:00Z'))
      .find((part) => part.type === 'hour')?.value;
    expect(hourOf(hour ?? '')).toBe(0);
    expect(hourOf('24')).toBe(0);
    expect(hourOf('13')).toBe(13);
  });
});
