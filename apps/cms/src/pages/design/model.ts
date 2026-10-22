import type { DesignConfig, DesignElement } from '@rubinny/shared';

export type Design = DesignConfig;
export type Element = DesignElement;

let counter = 0;
export function newId(): string {
  counter += 1;
  return `el-${Date.now().toString(36)}-${String(counter)}`;
}

export const CANVAS_PRESETS = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

export function textElement(design: Design, text: string): Element {
  const w = Math.round(design.width * 0.6);
  return {
    id: newId(),
    kind: 'text',
    text,
    x: Math.round((design.width - w) / 2),
    y: Math.round(design.height * 0.4),
    w,
    h: Math.round(design.height * 0.15),
    rotation: 0,
    opacity: 1,
    fontSize: Math.round(design.height * 0.07),
    fontWeight: 600,
    italic: false,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.2,
    font: 'heebo',
    letterSpacing: 0,
    uppercase: false,
    radius: 0,
  };
}

export function shapeElement(design: Design, shape: 'rect' | 'ellipse'): Element {
  const size = Math.round(Math.min(design.width, design.height) * 0.3);
  return {
    id: newId(),
    kind: 'shape',
    shape,
    x: Math.round((design.width - size) / 2),
    y: Math.round((design.height - size) / 2),
    w: size,
    h: size,
    rotation: 0,
    opacity: 1,
    fill: '#6366f1',
    radius: shape === 'rect' ? Math.round(size * 0.08) : 0,
    strokeWidth: 0,
  };
}

export function imageElement(
  design: Design,
  mediaId: string,
  natural?: { width: number | null; height: number | null },
): Element {
  const ratio = natural?.width && natural.height ? natural.width / natural.height : 16 / 9;
  let w = Math.round(design.width * 0.5);
  let h = Math.round(w / ratio);
  if (h > design.height * 0.8) {
    h = Math.round(design.height * 0.8);
    w = Math.round(h * ratio);
  }
  return {
    id: newId(),
    kind: 'image',
    mediaId,
    x: Math.round((design.width - w) / 2),
    y: Math.round((design.height - h) / 2),
    w,
    h,
    rotation: 0,
    opacity: 1,
    fit: 'cover',
    radius: 0,
    alt: '',
  };
}

export function moveLayer(elements: Element[], index: number, delta: number): Element[] {
  const target = index + delta;
  if (target < 0 || target >= elements.length) return elements;
  const next = [...elements];
  const [moved] = next.splice(index, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}

/** Snaps a moving box to canvas edges/center and other elements, within `threshold`. */
export function snap(
  box: { x: number; y: number; w: number; h: number },
  design: Design,
  others: readonly Element[],
  threshold: number,
): { x: number; y: number; guides: { v: number[]; h: number[] } } {
  const vTargets = [0, design.width / 2, design.width];
  const hTargets = [0, design.height / 2, design.height];
  for (const other of others) {
    vTargets.push(other.x, other.x + other.w / 2, other.x + other.w);
    hTargets.push(other.y, other.y + other.h / 2, other.y + other.h);
  }
  const best = (points: number[], targets: number[]) => {
    let result: { delta: number; at: number } | null = null;
    for (const point of points) {
      for (const target of targets) {
        const delta = target - point;
        if (Math.abs(delta) <= threshold && (!result || Math.abs(delta) < Math.abs(result.delta))) {
          result = { delta, at: target };
        }
      }
    }
    return result;
  };
  const sx = best([box.x, box.x + box.w / 2, box.x + box.w], vTargets);
  const sy = best([box.y, box.y + box.h / 2, box.y + box.h], hTargets);
  return {
    x: Math.round(box.x + (sx?.delta ?? 0)),
    y: Math.round(box.y + (sy?.delta ?? 0)),
    guides: { v: sx ? [sx.at] : [], h: sy ? [sy.at] : [] },
  };
}
