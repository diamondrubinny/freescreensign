// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function Brand() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className="flex items-center gap-2 text-xl font-extrabold tracking-tight no-underline"
    >
      <img src="/favicon.svg" alt="" className="size-8" />
      <span>{t('app.name')}</span>
    </Link>
  );
}
