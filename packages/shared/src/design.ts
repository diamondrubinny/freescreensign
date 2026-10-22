import { z } from 'zod';

/**
 * Free-form slide ("design"): a fixed-size canvas with absolutely positioned
 * text, image and shape elements. Array order is the stacking order.
 *
 * Every style is built from bounded values (never free CSS), so a design cannot inject
 * styles. Styles that need newer CSS stay within what Chromium 69 renders (TV screens).
 */
/** #rrggbb, or #rrggbbaa with transparency. */
const color = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Expected a #rrggbb color');
const coord = z.number().min(-16384).max(16384);
const size = z.number().min(1).max(16384);

/** Fonts bundled with the player and the dashboard (SIL OFL, no network). */
export const DESIGN_FONTS = ['heebo', 'rubik', 'frank-ruhl', 'secular-one', 'bebas-neue'] as const;
export type DesignFont = (typeof DESIGN_FONTS)[number];
/** CSS font stacks; Heebo covers Hebrew where a font has none (Bebas Neue). */
export const DESIGN_FONT_FAMILIES: Record<DesignFont, string> = {
  heebo: "'Heebo Variable', 'Noto Sans Hebrew', Arial, sans-serif",
  rubik: "'Rubik Variable', 'Heebo Variable', Arial, sans-serif",
  'frank-ruhl': "'Frank Ruhl Libre Variable', 'Heebo Variable', Georgia, serif",
  'secular-one': "'Secular One', 'Heebo Variable', Arial, sans-serif",
  'bebas-neue': "'Bebas Neue', 'Heebo Variable', Arial, sans-serif",
};

/** A linear or radial gradient of 2 to 4 colors, painted over the solid color. */
export const designGradientSchema = z.object({
  type: z.enum(['linear', 'radial']).default('linear'),
  /** Direction of a linear gradient, in degrees (0: bottom to top, 90: left to right). */
  angle: z.number().min(0).max(360).default(180),
  stops: z
    .array(z.object({ color, at: z.number().min(0).max(100) }))
    .min(2)
    .max(4),
});

export const designShadowSchema = z.object({
  x: z.number().min(-200).max(200).default(0),
  y: z.number().min(-200).max(200).default(8),
  blur: z.number().min(0).max(300).default(24),
  color: color.default('#00000080'),
});

export const DESIGN_ENTER_ANIMATIONS = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom',
  'pop',
] as const;
export const DESIGN_LOOP_ANIMATIONS = ['none', 'pulse', 'float', 'sway'] as const;

/** How an element appears when the slide starts, and an optional gentle loop after it. */
export const designAnimationSchema = z.object({
  enter: z.enum(DESIGN_ENTER_ANIMATIONS).default('none'),
  /** Milliseconds after the slide starts. */
  delay: z.number().int().min(0).max(10_000).default(0),
  duration: z.number().int().min(100).max(5000).default(700),
  loop: z.enum(DESIGN_LOOP_ANIMATIONS).default('none'),
});

export type DesignGradient = z.infer<typeof designGradientSchema>;
export type DesignShadow = z.infer<typeof designShadowSchema>;
export type DesignAnimation = z.infer<typeof designAnimationSchema>;

const base = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  x: coord,
  y: coord,
  w: size,
  h: size,
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  shadow: designShadowSchema.optional(),
  animation: designAnimationSchema.optional(),
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
  /** Where the text sits in its box, top to bottom. */
  valign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: z.number().min(0.8).max(3).default(1.2),
  font: z.enum(DESIGN_FONTS).default('heebo'),
  /** Extra space between letters, in em. */
  letterSpacing: z.number().min(-0.1).max(1).default(0),
  /** Capital letters (Latin text; Hebrew has none). */
  uppercase: z.boolean().default(false),
  /** Thin outline around the letters. */
  outline: z
    .object({ color: color.default('#000000'), width: z.number().min(0.5).max(20).default(2) })
    .optional(),
  /** Optional box behind the text. */
  background: color.optional(),
  backgroundGradient: designGradientSchema.optional(),
  /** Corner radius of the box behind the text. */
  radius: z.number().min(0).max(8192).default(0),
});

export const designImageSchema = z.object({
  ...base,
  kind: z.literal('image'),
  mediaId: z.uuid(),
  fit: z.enum(['cover', 'contain']).default('cover'),
  radius: z.number().min(0).max(8192).default(0),
  /** A color over the picture (with transparency), so text on it stays readable. */
  overlay: color.optional(),
  /** Short description for the dashboard (the player shows images as decoration). */
  alt: z.string().max(300).default(''),
});

export const designShapeSchema = z.object({
  ...base,
  kind: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse']).default('rect'),
  fill: color.default('#4f46e5'),
  gradient: designGradientSchema.optional(),
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
    /** From 100 px, so thin strips (a header, a banner) can be designs too. */
    width: z.number().int().min(100).max(7680).default(1920),
    height: z.number().int().min(100).max(7680).default(1080),
    background: color.default('#111827'),
    backgroundGradient: designGradientSchema.optional(),
    backgroundMediaId: z.uuid().optional(),
    /** Off: elements appear at once, without enter or loop animations. */
    animate: z.boolean().default(true),
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

/** CSS `background-image` of a gradient. */
export function designGradientCss(gradient: DesignGradient): string {
  const stops = [...gradient.stops]
    .sort((a, b) => a.at - b.at)
    .map((stop) => `${stop.color} ${String(stop.at)}%`)
    .join(', ');
  return gradient.type === 'radial'
    ? `radial-gradient(circle at center, ${stops})`
    : `linear-gradient(${String(gradient.angle)}deg, ${stops})`;
}

const shadowCss = (shadow: DesignShadow) =>
  `${String(shadow.x)}px ${String(shadow.y)}px ${String(shadow.blur)}px ${shadow.color}`;

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
    const boxed = Boolean(element.background ?? element.backgroundGradient);
    Object.assign(style, {
      fontFamily: DESIGN_FONT_FAMILIES[element.font],
      fontSize: `${String(element.fontSize)}px`,
      fontWeight: String(element.fontWeight),
      fontStyle: element.italic ? 'italic' : 'normal',
      color: element.color,
      textAlign: element.align,
      lineHeight: String(element.lineHeight),
      letterSpacing: element.letterSpacing ? `${String(element.letterSpacing)}em` : 'normal',
      textTransform: element.uppercase ? 'uppercase' : 'none',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      padding: boxed
        ? `${String(Math.round(element.fontSize * 0.15))}px ${String(Math.round(element.fontSize * 0.3))}px`
        : '0',
      backgroundColor: element.background ?? 'transparent',
      backgroundImage: element.backgroundGradient
        ? designGradientCss(element.backgroundGradient)
        : 'none',
      borderRadius: `${String(element.radius)}px`,
    });
    if (element.valign !== 'top') {
      // The text is the box's only content, so a column flexbox moves it down.
      Object.assign(style, {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: element.valign === 'middle' ? 'center' : 'flex-end',
      });
    }
    // Text in a box casts its shadow from the box; bare text from the letters.
    if (element.shadow) {
      style[boxed ? 'boxShadow' : 'textShadow'] = shadowCss(element.shadow);
    }
    if (element.outline) {
      style.WebkitTextStroke = `${String(element.outline.width)}px ${element.outline.color}`;
      style.paintOrder = 'stroke fill';
    }
  } else if (element.kind === 'shape') {
    Object.assign(style, {
      backgroundColor: element.fill,
      backgroundImage: element.gradient ? designGradientCss(element.gradient) : 'none',
      borderRadius: element.shape === 'ellipse' ? '50%' : `${String(element.radius)}px`,
      border:
        element.stroke && element.strokeWidth > 0
          ? `${String(element.strokeWidth)}px solid ${element.stroke}`
          : 'none',
    });
    if (element.shadow) style.boxShadow = shadowCss(element.shadow);
  } else {
    style.borderRadius = `${String(element.radius)}px`;
    if (element.shadow) style.boxShadow = shadowCss(element.shadow);
  }
  return style;
}

/** CSS of the canvas background (solid color, with an optional gradient over it). */
export function designCanvasStyle(
  config: Pick<DesignConfig, 'width' | 'height' | 'background' | 'backgroundGradient'>,
): Record<string, string> {
  return {
    width: `${String(config.width)}px`,
    height: `${String(config.height)}px`,
    backgroundColor: config.background,
    backgroundImage: config.backgroundGradient
      ? designGradientCss(config.backgroundGradient)
      : 'none',
  };
}

/**
 * CSS animation of an element, or null when it has none (or the design turns them off).
 * Applied to a wrapper around the element, so it does not replace the element's rotation.
 * The keyframes (`rd-enter-*`, `rd-loop-*`) are in @rubinny/shared/design.css.
 */
export function designAnimationCss(element: DesignElement, animate: boolean): string | null {
  const animation = element.animation;
  if (!animate || !animation) return null;
  const parts: string[] = [];
  if (animation.enter !== 'none') {
    parts.push(
      `rd-enter-${animation.enter} ${String(animation.duration)}ms cubic-bezier(0.2, 0.7, 0.2, 1) ${String(animation.delay)}ms both`,
    );
  }
  if (animation.loop !== 'none') {
    const start =
      animation.enter === 'none' ? animation.delay : animation.delay + animation.duration;
    const period = { pulse: 1800, float: 4000, sway: 5000 }[animation.loop];
    parts.push(
      `rd-loop-${animation.loop} ${String(period)}ms ease-in-out ${String(start)}ms infinite`,
    );
  }
  return parts.length > 0 ? parts.join(', ') : null;
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
