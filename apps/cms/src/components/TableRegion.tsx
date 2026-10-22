// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ReactNode } from 'react';

/**
 * The container of a data table. On narrow screens the table scrolls sideways inside it, so
 * it is a named, focusable region: keyboard users can reach it and scroll with the arrow keys
 * (WCAG 2.1.1), and screen readers announce what it holds.
 */
export function TableRegion({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable
    <div role="region" aria-label={label} tabIndex={0} className={`table-wrap ${className}`.trim()}>
      {children}
    </div>
  );
}
