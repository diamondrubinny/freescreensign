// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ReactNode } from 'react';

type Variant = 'error' | 'success' | 'info' | 'warning';

const STYLES: Record<Variant, string> = {
  error: 'border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
  success: 'border-green-700 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
  info: 'border-brand-700 bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-100',
  warning: 'border-amber-700 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
};

/**
 * Status message. Errors use role="alert" (assertive); others use role="status"
 * (polite). Meaning is conveyed by text, never by color alone.
 */
export function Alert({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border-s-4 px-4 py-3 ${STYLES[variant]}`}
    >
      {children}
    </div>
  );
}
