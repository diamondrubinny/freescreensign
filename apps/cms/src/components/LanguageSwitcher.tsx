// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, isSupportedLocale } from '@rubinny/shared';
import { changeLocale } from '../i18n';

const NAMES: Record<string, string> = { he: 'עברית', en: 'English' };

export function LanguageSwitcher({ onChange }: { onChange?: (locale: string) => void }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t('nav.language')}
      </label>
      <select
        id={id}
        value={i18n.language}
        onChange={(event) => {
          const locale = event.target.value;
          if (isSupportedLocale(locale)) {
            void changeLocale(locale);
            onChange?.(locale);
          }
        }}
        className="rounded-md border border-gray-400 bg-white px-2 py-2 dark:bg-gray-900"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {NAMES[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
