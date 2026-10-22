import { designCanvasStyle, designElementStyle } from '@rubinny/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { snap, type Design, type Element } from './model';

type Handle = 'nw' | 'ne' | 'sw' | 'se';
const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];
const MIN_SIZE = 10;

interface Gesture {
  mode: 'move' | Handle;
  id: string;
  startX: number;
  startY: number;
  origin: Element;
}

export function mediaFileUrl(orgId: string, mediaId: string) {
  return `/api/v1/orgs/${orgId}/media/${mediaId}/file`;
}

/**
 * The design surface. Mouse/touch: drag to move, corner handles to resize, with
 * snapping guides. Keyboard: Tab to an element, arrows to move (Shift = 10px),
 * Delete to remove. Every change is also possible from the properties panel.
 */
export function DesignCanvas({
  orgId,
  design,
  selectedId,
  onSelect,
  onChange,
  onCommit,
  onDelete,
  elementLabel,
}: {
  orgId: string;
  design: Design;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** transient = part of an ongoing gesture (one undo step on commit). */
  onChange: (design: Design, transient: boolean) => void;
  onCommit: () => void;
  onDelete: (id: string) => void;
  elementLabel: (element: Element) => string;
}) {
  const { t } = useTranslation();
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(800);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 0) setFrameWidth(node.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scale = frameWidth / design.width;
  const update = (id: string, patch: Partial<Element>, transient: boolean) => {
    onChange(
      {
        ...design,
        elements: design.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)),
      },
      transient,
    );
  };

  const start = (event: PointerEvent, element: Element, mode: Gesture['mode']) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(element.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setGesture({
      mode,
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: element,
    });
  };

  const move = (event: PointerEvent) => {
    if (!gesture) return;
    const dx = (event.clientX - gesture.startX) / scale;
    const dy = (event.clientY - gesture.startY) / scale;
    const o = gesture.origin;
    const others = design.elements.filter((e) => e.id !== o.id);
    if (gesture.mode === 'move') {
      const snapped = event.altKey
        ? { x: Math.round(o.x + dx), y: Math.round(o.y + dy), guides: { v: [], h: [] } }
        : snap({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h }, design, others, 8 / scale);
      setGuides(snapped.guides);
      update(o.id, { x: snapped.x, y: snapped.y }, true);
      return;
    }
    const west = gesture.mode.endsWith('w');
    const north = gesture.mode.startsWith('n');
    const w = Math.max(MIN_SIZE, Math.round(west ? o.w - dx : o.w + dx));
    const h = Math.max(MIN_SIZE, Math.round(north ? o.h - dy : o.h + dy));
    update(
      o.id,
      {
        w,
        h,
        x: west ? Math.round(o.x + o.w - w) : o.x,
        y: north ? Math.round(o.y + o.h - h) : o.y,
      },
      true,
    );
  };

  const end = () => {
    if (!gesture) return;
    setGesture(null);
    setGuides({ v: [], h: [] });
    onCommit();
  };

  const onKey = (event: KeyboardEvent, element: Element) => {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault();
      update(element.id, { x: element.x + delta[0], y: element.y + delta[1] }, false);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete(element.id);
    } else if (event.key === 'Escape') {
      onSelect(null);
    }
  };

  return (
    <div
      ref={frame}
      dir="ltr"
      className="relative w-full overflow-hidden rounded-lg border border-gray-300 bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] select-none dark:border-gray-700"
      style={{ height: `${String(design.height * scale)}px` }}
      onPointerDown={() => {
        onSelect(null);
      }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ ...designCanvasStyle(design), transform: `scale(${String(scale)})` }}
      >
        {design.backgroundMediaId && (
          <img
            src={mediaFileUrl(orgId, design.backgroundMediaId)}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        )}
        {design.elements.map((element) => {
          const selected = element.id === selectedId;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={elementLabel(element)}
              data-element={element.id}
              dir={element.kind === 'text' ? 'auto' : undefined}
              onPointerDown={(event) => {
                start(event, element, 'move');
              }}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onFocus={() => {
                onSelect(element.id);
              }}
              onKeyDown={(event) => {
                onKey(event, element);
              }}
              className="cursor-move focus-visible:outline-none"
              style={{
                ...designElementStyle(element),
                overflow: element.kind === 'text' ? 'hidden' : 'visible',
                outline: selected ? `${String(2 / scale)}px solid #4338ca` : undefined,
                outlineOffset: selected ? `${String(1 / scale)}px` : undefined,
              }}
            >
              {element.kind === 'text' && element.text}
              {element.kind === 'image' && (
                <img
                  src={mediaFileUrl(orgId, element.mediaId)}
                  alt=""
                  draggable={false}
                  className="pointer-events-none block size-full bg-gray-300"
                  style={{ objectFit: element.fit, borderRadius: `${String(element.radius)}px` }}
                />
              )}
              {element.kind === 'image' && element.overlay && (
                <div
                  className="w-design-overlay pointer-events-none"
                  style={{ backgroundColor: element.overlay }}
                />
              )}
              {selected &&
                HANDLES.map((handle) => (
                  <span
                    key={handle}
                    aria-hidden="true"
                    title={t('designer.resize')}
                    onPointerDown={(event) => {
                      start(event, element, handle);
                    }}
                    onPointerMove={move}
                    onPointerUp={end}
                    className="absolute rounded-sm border-white bg-brand-700"
                    style={{
                      width: `${String(14 / scale)}px`,
                      height: `${String(14 / scale)}px`,
                      borderWidth: `${String(2 / scale)}px`,
                      cursor: handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize',
                      [handle.startsWith('n') ? 'top' : 'bottom']: `${String(-7 / scale)}px`,
                      [handle.endsWith('w') ? 'left' : 'right']: `${String(-7 / scale)}px`,
                    }}
                  />
                ))}
            </div>
          );
        })}
        {guides.v.map((x) => (
          <span
            key={`v${String(x)}`}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bg-pink-500"
            style={{ left: `${String(x)}px`, width: `${String(1 / scale)}px`, height: '100%' }}
          />
        ))}
        {guides.h.map((y) => (
          <span
            key={`h${String(y)}`}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 bg-pink-500"
            style={{ top: `${String(y)}px`, height: `${String(1 / scale)}px`, width: '100%' }}
          />
        ))}
      </div>
    </div>
  );
}
