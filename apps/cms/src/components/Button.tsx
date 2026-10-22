// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'link';

const STYLES: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white shadow-sm hover:bg-brand-800 disabled:bg-brand-400 dark:bg-brand-600 dark:hover:bg-brand-500',
  secondary:
    'border border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 disabled:bg-red-400',
  link: 'text-brand-700 underline hover:text-brand-900 dark:text-brand-300',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** "sm" for rows of actions in cards and tables. */
  size?: 'md' | 'sm';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  // No color transition: a button that becomes enabled would otherwise fade from the pale
  // disabled color under white text, failing contrast for a moment.
  const base =
    variant === 'link'
      ? 'inline p-0'
      : `inline-flex items-center justify-center gap-2 rounded-lg font-medium [&>svg]:size-4 [&>svg]:shrink-0 ${
          size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'
        }`;
  return (
    <button
      type={type}
      className={`${base} ${STYLES[variant]} disabled:cursor-not-allowed ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
