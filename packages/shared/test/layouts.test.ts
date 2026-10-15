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
