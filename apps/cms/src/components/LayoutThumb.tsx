// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/** Decorative miniature of a layout's zones (the accessible description is in the page text). */
export function LayoutThumb({
  width,
  height,
  zones,
  className = '',
}: {
  width: number;
  height: number;
  zones: readonly { x: number; y: number; w: number; h: number }[];
  className?: string;
}) {
  const gap = Math.max(width, height) * 0.008;
  return (
    <svg
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      aria-hidden="true"
      focusable="false"
      className={`block h-auto w-full rounded-md bg-gray-900 ${className}`}
    >
      {zones.map((zone, index) => (
        <rect
          key={String(index)}
          x={zone.x + gap}
          y={zone.y + gap}
          width={Math.max(zone.w - gap * 2, 1)}
          height={Math.max(zone.h - gap * 2, 1)}
          rx={gap * 2}
          className={
            index === 0 ? 'fill-brand-500' : index % 2 ? 'fill-brand-300' : 'fill-amber-400'
          }
        />
      ))}
    </svg>
  );
}
