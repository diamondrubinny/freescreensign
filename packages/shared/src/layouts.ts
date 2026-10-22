// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';

/** Limits shared by the server (validation), the CMS (forms) and the manifest. */
export const LAYOUT_LIMITS = {
  maxCanvas: 16384,
  maxZones: 32,
  maxZ: 100,
} as const;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');
const size = z.number().int().min(1).max(LAYOUT_LIMITS.maxCanvas);
const offset = z
  .number()
  .int()
  .min(0)
  .max(LAYOUT_LIMITS.maxCanvas - 1);

/** Video walls (docs/phases/12-touch-wall-ai.md): limits of the grid and the bezel. */
export const WALL_LIMITS = { maxColumns: 8, maxRows: 8, maxBezelPx: 500 } as const;

/**
 * A screen's place in a video wall: the grid, its cell (0-based, from the top left as seen
 * by viewers) and the gap between neighbouring pictures (frames), in the screen's pixels.
 */
export const wallSchema = z
  .object({
    columns: z.number().int().min(1).max(WALL_LIMITS.maxColumns),
    rows: z.number().int().min(1).max(WALL_LIMITS.maxRows),
    column: z.number().int().min(0),
    row: z.number().int().min(0),
    bezelX: z.number().int().min(0).max(WALL_LIMITS.maxBezelPx).default(0),
    bezelY: z.number().int().min(0).max(WALL_LIMITS.maxBezelPx).default(0),
  })
  .superRefine((wall, ctx) => {
    if (wall.column >= wall.columns) {
      ctx.addIssue({ code: 'custom', message: 'Column outside the wall', path: ['column'] });
    }
    if (wall.row >= wall.rows) {
      ctx.addIssue({ code: 'custom', message: 'Row outside the wall', path: ['row'] });
    }
  });
export type Wall = z.infer<typeof wallSchema>;

/** Touch screens (docs/phases/12-touch-wall-ai.md). */
export const TOUCH_LIMITS = {
  minIdleSeconds: 10,
  maxIdleSeconds: 600,
  defaultIdleSeconds: 60,
  /** How many taps deep a screen can go from its scheduled layout. */
  maxDepth: 5,
  /** Recommended minimum size of a touch target on the screen (WCAG 2.5.8 / 2.5.5). */
  minTargetPx: 44,
} as const;

/** What a tap on a zone does: open another layout of the organization, or go back. */
export const zoneActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('layout'), layoutId: z.uuid() }),
  z.object({ type: z.literal('back') }),
]);
export type ZoneAction = z.infer<typeof zoneActionSchema>;

export const layoutZoneInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  x: offset,
  y: offset,
  w: size,
  h: size,
  z: z.number().int().min(0).max(LAYOUT_LIMITS.maxZ).default(0),
  playlistId: z.uuid().nullable().default(null),
  action: zoneActionSchema.nullable().default(null),
  /** Accessible name of a zone that reacts to taps; the zone's name when empty. */
  label: z.string().trim().max(100).nullable().default(null),
});

export type LayoutZoneInput = z.infer<typeof layoutZoneInputSchema>;

/** Zones must lie fully inside the canvas. Returns the indexes of offending zones. */
export function zonesOutOfBounds(
  canvas: { width: number; height: number },
  zones: readonly Pick<LayoutZoneInput, 'x' | 'y' | 'w' | 'h'>[],
): number[] {
  return zones.flatMap((zone, index) =>
    zone.x + zone.w > canvas.width || zone.y + zone.h > canvas.height ? [index] : [],
  );
}

export const layoutInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    width: size,
    height: size,
    background: color.default('#000000'),
    idleSeconds: z
      .number()
      .int()
      .min(TOUCH_LIMITS.minIdleSeconds)
      .max(TOUCH_LIMITS.maxIdleSeconds)
      .default(TOUCH_LIMITS.defaultIdleSeconds),
    zones: z.array(layoutZoneInputSchema).min(1).max(LAYOUT_LIMITS.maxZones),
  })
  .superRefine((layout, ctx) => {
    for (const index of zonesOutOfBounds(layout, layout.zones)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Zone exceeds the canvas',
        path: ['zones', index, 'w'],
        params: { reason: 'out_of_bounds' },
      });
    }
  });

export type LayoutInput = z.infer<typeof layoutInputSchema>;

export const LAYOUT_TEMPLATE_IDS = [
  'fullscreen',
  'main-ticker',
  'header-main-footer',
  'two-columns',
  'l-bar',
  'grid-2x2',
  'three-rows',
  'showcase',
] as const;
export type LayoutTemplateId = (typeof LAYOUT_TEMPLATE_IDS)[number];

/** Zone geometry in percent of the canvas; zone names are stable keys for translation. */
const TEMPLATES: Record<
  LayoutTemplateId,
  { name: string; x: number; y: number; w: number; h: number }[]
> = {
  fullscreen: [{ name: 'main', x: 0, y: 0, w: 100, h: 100 }],
  'main-ticker': [
    { name: 'main', x: 0, y: 0, w: 100, h: 88 },
    { name: 'ticker', x: 0, y: 88, w: 100, h: 12 },
  ],
  'two-columns': [
    { name: 'left', x: 0, y: 0, w: 50, h: 100 },
    { name: 'right', x: 50, y: 0, w: 50, h: 100 },
  ],
  'l-bar': [
    { name: 'main', x: 0, y: 0, w: 75, h: 85 },
    { name: 'side', x: 75, y: 0, w: 25, h: 85 },
    { name: 'bottom', x: 0, y: 85, w: 100, h: 15 },
  ],
  'header-main-footer': [
    { name: 'header', x: 0, y: 0, w: 100, h: 14 },
    { name: 'main', x: 0, y: 14, w: 100, h: 74 },
    { name: 'footer', x: 0, y: 88, w: 100, h: 12 },
  ],
  'grid-2x2': [
    { name: 'topLeft', x: 0, y: 0, w: 50, h: 50 },
    { name: 'topRight', x: 50, y: 0, w: 50, h: 50 },
    { name: 'bottomLeft', x: 0, y: 50, w: 50, h: 50 },
    { name: 'bottomRight', x: 50, y: 50, w: 50, h: 50 },
  ],
  'three-rows': [
    { name: 'top', x: 0, y: 0, w: 100, h: 30 },
    { name: 'middle', x: 0, y: 30, w: 100, h: 50 },
    { name: 'bottom', x: 0, y: 80, w: 100, h: 20 },
  ],
  /** A wide main zone, a side panel and a ticker (menus with a dish of the day, cinemas). */
  showcase: [
    { name: 'main', x: 0, y: 0, w: 62, h: 88 },
    { name: 'side', x: 62, y: 0, w: 38, h: 88 },
    { name: 'ticker', x: 0, y: 88, w: 100, h: 12 },
  ],
};

/** Template geometry in percent (for drawing thumbnails). */
export function templatePreview(template: LayoutTemplateId) {
  return TEMPLATES[template];
}

/** Builds a template's zones for a canvas size. Edges snap so zones tile exactly. */
export function templateZones(
  template: LayoutTemplateId,
  canvas: { width: number; height: number },
): LayoutZoneInput[] {
  const px = (percent: number, total: number) => Math.round((percent / 100) * total);
  return TEMPLATES[template].map((zone) => {
    const x = px(zone.x, canvas.width);
    const y = px(zone.y, canvas.height);
    return {
      name: zone.name,
      x,
      y,
      w: Math.max(px(zone.x + zone.w, canvas.width) - x, 1),
      h: Math.max(px(zone.y + zone.h, canvas.height) - y, 1),
      z: 0,
      playlistId: null,
      action: null,
      label: null,
    };
  });
}
