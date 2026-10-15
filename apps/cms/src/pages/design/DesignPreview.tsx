import { designElementStyle } from '@rubinny/shared';
import { useEffect, useRef, useState } from 'react';
import { mediaFileUrl } from './DesignCanvas';
import type { Design } from './model';

/**
 * A true-to-life miniature of a design. It is a picture of the design (role="img"
 * with a name), so its tiny scaled text is not presented as page text.
 */
export function DesignPreview({
  design,
  label,
  orgId,
}: {
  design: Design;
  label: string;
  orgId?: string;
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
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: `${String(design.width)}px`,
          height: `${String(design.height)}px`,
          transform: `scale(${String(scale)})`,
          backgroundColor: design.background,
        }}
      >
        {design.elements.map((element) => (
          <div
            key={element.id}
            dir={element.kind === 'text' ? 'auto' : undefined}
            style={designElementStyle(element)}
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
          </div>
        ))}
      </div>
    </div>
  );
}
