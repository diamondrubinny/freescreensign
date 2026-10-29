// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { SacredMode } from '@rubinny/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { inputClass, linkClass } from './ui';

/**
 * "Always / only on Shabbat and holidays / not on them" for a schedule rule or a playlist
 * item. Without the organization's place the condition cannot be chosen (it would never be
 * right), and a note links to the settings; a value already set can still be cleared.
 */
export function SacredField({
  id,
  orgId,
  value,
  available,
  error,
  onChange,
}: {
  id: string;
  orgId: string;
  value: SacredMode | null;
  /** Whether the organization has set its place (undefined while loading). */
  available: boolean | undefined;
  error?: string | undefined;
  onChange: (value: SacredMode | null) => void;
}) {
  const { t } = useTranslation();
  const missing = available === false;
  const described = [`${id}-hint`, missing ? `${id}-missing` : '', error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {t('sacred.field')}
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={missing && value === null}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        onChange={(event) => {
          onChange((event.target.value || null) as SacredMode | null);
        }}
        className={`${inputClass} px-2! py-1.5! sm:w-60`}
      >
        <option value="">{t('sacred.modes.always')}</option>
        <option value="only">{t('sacred.modes.only')}</option>
        <option value="skip">{t('sacred.modes.skip')}</option>
      </select>
      <p id={`${id}-hint`} className="text-sm text-gray-700 dark:text-gray-300">
        {t('sacred.fieldHint')}
      </p>
      {missing && (
        <p id={`${id}-missing`} className="text-sm text-gray-700 dark:text-gray-300">
          {t('sacred.needsPlace')}{' '}
          <Link to={`/orgs/${orgId}/settings#sacred-heading`} className={linkClass}>
            {t('sacred.needsPlaceLink')}
          </Link>
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red-800 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
