// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  error?: string | undefined;
}

/** Labelled input with hint and error wired to aria-describedby / aria-invalid. */
export function Field({ label, name, hint, error, required, className = '', ...input }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-red-700 dark:text-red-400">
            {' '}
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-gray-700 dark:text-gray-300">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`rounded-lg border bg-white px-3 py-2 text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100 ${
          error ? 'border-red-700 dark:border-red-400' : 'border-gray-400 dark:border-gray-600'
        }`}
        {...input}
      />
      {error && (
        <p id={errorId} className="text-sm font-medium text-red-800 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
