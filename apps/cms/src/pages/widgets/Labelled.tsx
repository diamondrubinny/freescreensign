// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useId, type ReactNode } from 'react';

/** A label, a control (given its id and error wiring) and the control's error message. */
export function Labelled({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}),
      })}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
