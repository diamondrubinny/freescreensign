import { describe, expect, it } from 'vitest';
import { isTimeZone, timeZoneOptions, timeZoneSchema } from '../src/index.js';

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
