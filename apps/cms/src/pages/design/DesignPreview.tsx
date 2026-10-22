import { designAnimationCss, designCanvasStyle, designElementStyle } from '@rubinny/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { mediaFileUrl } from './DesignCanvas';
import type { Design } from './model';

/**
 * A true-to-life miniature of a design. It is a picture of the design (role="img"
 * with a name), so its tiny scaled text is not presented as page text. With `animate`,
 * it plays the elements' animations like a screen does (remount it to replay).
 */
export function DesignPreview({
  design,
  label,
  orgId,
  animate = false,
}: {
  design: Design;
  label: string;
  orgId?: string;
  animate?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 0) setWidth(node.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  const scale = width / design.width;
  return (
    <div
      ref={frame}
      role="img"
      aria-label={label}
      dir="ltr"
      className="relative w-full overflow-hidden"
      style={{ height: `${String(design.height * scale)}px` }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{ ...designCanvasStyle(design), transform: `scale(${String(scale)})` }}
      >
        {design.backgroundMediaId && orgId && (
          <img
            src={mediaFileUrl(orgId, design.backgroundMediaId)}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        )}
        {design.elements.map((element) => {
          const style = designElementStyle(element) as CSSProperties;
          const animation = designAnimationCss(element, animate && design.animate);
          const node = (
            <div
              key={animation ? undefined : element.id}
              dir={element.kind === 'text' ? 'auto' : undefined}
              style={animation ? { ...style, left: 0, top: 0 } : style}
            >
              {element.kind === 'text' && element.text}
              {element.kind === 'image' && orgId && (
                <img
                  src={mediaFileUrl(orgId, element.mediaId)}
                  alt=""
                  className="block size-full"
                  style={{ objectFit: element.fit }}
                />
              )}
              {element.kind === 'image' && element.overlay && (
                <div className="w-design-overlay" style={{ backgroundColor: element.overlay }} />
              )}
            </div>
          );
          return animation ? (
            <div
              key={element.id}
              className="w-design-anim"
              style={{
                position: 'absolute',
                left: style.left,
                top: style.top,
                width: style.width,
                height: style.height,
                animation,
              }}
            >
              {node}
            </div>
          ) : (
            node
          );
        })}
      </div>
    </div>
  );
}
