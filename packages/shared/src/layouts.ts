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

export const layoutZoneInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  x: offset,
  y: offset,
  w: size,
  h: size,
  z: z.number().int().min(0).max(LAYOUT_LIMITS.maxZ).default(0),
  playlistId: z.uuid().nullable().default(null),
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

export const LAYOUT_TEMPLATE_IDS = ['fullscreen', 'main-ticker', 'two-columns', 'l-bar'] as const;
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
};

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
    };
  });
}
