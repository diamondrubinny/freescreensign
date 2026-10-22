import { templateZones, type LayoutTemplateId } from '@rubinny/shared';
import type { ArtName } from './art.js';

/**
 * Small builders for the designs of the starter kits. A design is sized to its zone, so it
 * fills it without bars. Art is referenced as "art:<name>" and replaced by the media id when
 * the kit is created (or dropped when there is no media storage). Every design is checked
 * against the shared schema when the kit is created and in the tests.
 */

export type Locale = 'he' | 'en';
type Element = Record<string, unknown>;

/** Pixel size of a template zone on the kits' 1920×1080 canvas. */
export function zoneSize(template: LayoutTemplateId, zone: string): { w: number; h: number } {
  const found = templateZones(template, { width: 1920, height: 1080 }).find((z) => z.name === zone);
  if (!found) throw new Error(`No zone ${zone} in ${template}`);
  return { w: found.w, h: found.h };
}

export const artRef = (name: ArtName) => `art:${name}`;

/** The art names a widget configuration uses. */
export function artNames(config: unknown): string[] {
  const names = new Set<string>();
  JSON.stringify(config, (_key, value: unknown) => {
    if (typeof value === 'string' && value.startsWith('art:')) names.add(value.slice(4));
    return value;
  });
  return [...names];
}

/**
 * Replaces art references by media ids. Without an id (no storage), an image element is
 * dropped and a background image is left out.
 */
export function resolveArt(config: Record<string, unknown>, ids: Map<string, string>) {
  const resolved = (value: unknown) =>
    typeof value === 'string' && value.startsWith('art:') ? ids.get(value.slice(4)) : value;
  const next: Record<string, unknown> = { ...config };
  if ('backgroundMediaId' in next) {
    const id = resolved(next.backgroundMediaId);
    if (id) next.backgroundMediaId = id;
    else delete next.backgroundMediaId;
  }
  if (Array.isArray(next.elements)) {
    next.elements = (next.elements as Element[]).flatMap((element) => {
      if (element.kind !== 'image') return [element];
      const id = resolved(element.mediaId);
      return id ? [{ ...element, mediaId: id }] : [];
    });
  }
  return next;
}

export function design(
  size: { w: number; h: number },
  background: string,
  elements: Element[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    width: size.w,
    height: size.h,
    background,
    ...extra,
    elements: elements.map((element, index) => ({ id: `el-${String(index + 1)}`, ...element })),
  };
}

/** Text; in a box (a button, a badge) it sits in the middle of the box. */
export const text = (props: Element): Element => ({
  kind: 'text',
  ...(props.background || props.backgroundGradient ? { valign: 'middle' } : {}),
  ...props,
});
export const shape = (props: Element): Element => ({ kind: 'shape', ...props });
export const image = (art: ArtName, props: Element): Element => ({
  kind: 'image',
  mediaId: artRef(art),
  fit: 'contain',
  ...props,
});

export const enter = (
  kind: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom' | 'pop',
  delay = 0,
  loop: 'none' | 'pulse' | 'float' | 'sway' = 'none',
  duration = 800,
): Element => ({ animation: { enter: kind, delay, duration, loop } });

export const glow = (color: string, blur = 40): Element => ({
  shadow: { x: 0, y: 0, blur, color },
});
export const drop = (opacity = '99'): Element => ({
  shadow: { x: 0, y: 14, blur: 36, color: `#000000${opacity}` },
});

/** A headline font that has the language's letters (Bebas Neue is Latin only). */
export const headline = (locale: Locale) => (locale === 'he' ? 'secular-one' : 'bebas-neue');
