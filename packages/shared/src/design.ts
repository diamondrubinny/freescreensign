import { z } from 'zod';

/**
 * Free-form slide ("design"): a fixed-size canvas with absolutely positioned
 * text, image and shape elements. Array order is the stacking order.
 */
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');
const coord = z.number().min(-16384).max(16384);
const size = z.number().min(1).max(16384);

const base = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  x: coord,
  y: coord,
  w: size,
  h: size,
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
};

export const designTextSchema = z.object({
  ...base,
  kind: z.literal('text'),
  text: z.string().max(2000),
  fontSize: z.number().min(6).max(1000).default(64),
  fontWeight: z.union([z.literal(400), z.literal(600), z.literal(800)]).default(600),
  italic: z.boolean().default(false),
  color: color.default('#ffffff'),
  align: z.enum(['start', 'center', 'end']).default('center'),
  lineHeight: z.number().min(0.8).max(3).default(1.2),
  /** Optional box behind the text. */
  background: color.optional(),
});

export const designImageSchema = z.object({
  ...base,
  kind: z.literal('image'),
  mediaId: z.uuid(),
  fit: z.enum(['cover', 'contain']).default('cover'),
  radius: z.number().min(0).max(8192).default(0),
});

export const designShapeSchema = z.object({
  ...base,
  kind: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse']).default('rect'),
  fill: color.default('#4f46e5'),
  radius: z.number().min(0).max(8192).default(0),
  stroke: color.optional(),
  strokeWidth: z.number().min(0).max(200).default(0),
});

export const designElementSchema = z.discriminatedUnion('kind', [
  designTextSchema,
  designImageSchema,
  designShapeSchema,
]);

export const DESIGN_MAX_ELEMENTS = 100;

export const designConfigSchema = z
  .object({
    width: z.number().int().min(320).max(7680).default(1920),
    height: z.number().int().min(320).max(7680).default(1080),
    background: color.default('#111827'),
    backgroundMediaId: z.uuid().optional(),
    elements: z.array(designElementSchema).max(DESIGN_MAX_ELEMENTS).default([]),
  })
  .refine((config) => new Set(config.elements.map((e) => e.id)).size === config.elements.length, {
    message: 'Element ids must be unique',
    path: ['elements'],
  });

export type DesignConfig = z.infer<typeof designConfigSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignText = z.infer<typeof designTextSchema>;
export type DesignImage = z.infer<typeof designImageSchema>;
export type DesignShape = z.infer<typeof designShapeSchema>;

/** Media referenced by a design (background and image elements). */
export function designMediaIds(
  config: Pick<DesignConfig, 'backgroundMediaId' | 'elements'>,
): string[] {
  const ids = new Set<string>();
  if (config.backgroundMediaId) ids.add(config.backgroundMediaId);
  for (const element of config.elements) if (element.kind === 'image') ids.add(element.mediaId);
  return [...ids];
}

/** CSS for one element, shared by the player and the CMS editor so both render alike. */
export function designElementStyle(element: DesignElement): Record<string, string> {
  const style: Record<string, string> = {
    position: 'absolute',
    left: `${String(element.x)}px`,
    top: `${String(element.y)}px`,
    width: `${String(element.w)}px`,
    height: `${String(element.h)}px`,
    transform: element.rotation ? `rotate(${String(element.rotation)}deg)` : 'none',
    opacity: String(element.opacity),
    boxSizing: 'border-box',
    overflow: 'hidden',
  };
  if (element.kind === 'text') {
    Object.assign(style, {
      fontSize: `${String(element.fontSize)}px`,
      fontWeight: String(element.fontWeight),
      fontStyle: element.italic ? 'italic' : 'normal',
      color: element.color,
      textAlign: element.align,
      lineHeight: String(element.lineHeight),
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      padding: element.background
        ? `${String(Math.round(element.fontSize * 0.15))}px ${String(Math.round(element.fontSize * 0.3))}px`
        : '0',
      backgroundColor: element.background ?? 'transparent',
    });
  } else if (element.kind === 'shape') {
    Object.assign(style, {
      backgroundColor: element.fill,
      borderRadius: element.shape === 'ellipse' ? '50%' : `${String(element.radius)}px`,
      border:
        element.stroke && element.strokeWidth > 0
          ? `${String(element.strokeWidth)}px solid ${element.stroke}`
          : 'none',
    });
  } else {
    style.borderRadius = `${String(element.radius)}px`;
  }
  return style;
}

/** Scale and offset that fit a design canvas into a box (letterboxed, centered). */
export function designFit(
  design: { width: number; height: number },
  box: { width: number; height: number },
): { scale: number; left: number; top: number } {
  const scale = Math.min(box.width / design.width, box.height / design.height) || 0;
  return {
    scale,
    left: (box.width - design.width * scale) / 2,
    top: (box.height - design.height * scale) / 2,
  };
}
