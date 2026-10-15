import { describe, expect, it } from 'vitest';
import {
  LAYOUT_TEMPLATE_IDS,
  layoutInputSchema,
  templateZones,
  zonesOutOfBounds,
} from '../src/index.js';

describe('layout templates', () => {
  it.each(LAYOUT_TEMPLATE_IDS)('%s tiles the canvas exactly, in any size', (id) => {
    for (const canvas of [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      { width: 1366, height: 767 },
    ]) {
      const zones = templateZones(id, canvas);
      expect(zonesOutOfBounds(canvas, zones)).toEqual([]);
      const area = zones.reduce((sum, z) => sum + z.w * z.h, 0);
      expect(area).toBe(canvas.width * canvas.height);
    }
  });

  it('validates zones against the canvas with a specific reason', () => {
    const result = layoutInputSchema.safeParse({
      name: 'x',
      width: 100,
      height: 100,
      zones: [{ name: 'a', x: 50, y: 0, w: 60, h: 10 }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['zones', 0, 'w'],
      params: { reason: 'out_of_bounds' },
    });
  });
});

describe('zoned time', () => {
  it('converts wall-clock time in a zone, across DST', async () => {
    const { zonedDateTime, splitDuration } = await import('../src/index.js');
    // Israel: UTC+3 in summer, UTC+2 in winter.
    expect(zonedDateTime('2026-07-01T12:00', 'Asia/Jerusalem').toISOString()).toBe(
      '2026-07-01T09:00:00.000Z',
    );
    expect(zonedDateTime('2026-12-14T18:00', 'Asia/Jerusalem').toISOString()).toBe(
      '2026-12-14T16:00:00.000Z',
    );
    expect(zonedDateTime('2026-11-01T12:00', 'America/New_York').toISOString()).toBe(
      '2026-11-01T17:00:00.000Z',
    );
    expect(splitDuration(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(splitDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('validates countdown widgets', async () => {
    const { parseWidgetConfig } = await import('../src/index.js');
    expect(
      parseWidgetConfig('countdown', { title: 'חנוכה', target: '2026-12-04T17:00' }),
    ).toMatchObject({
      success: true,
      config: { showSeconds: true, locale: 'he' },
    });
    expect(parseWidgetConfig('countdown', { title: 'x', target: 'tomorrow' }).success).toBe(false);
  });
});
