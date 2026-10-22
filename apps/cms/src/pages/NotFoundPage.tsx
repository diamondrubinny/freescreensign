// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeading } from '../components/PageHeading';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeading title={t('notFound.title')} />
      <p className="mb-4">{t('notFound.text')}</p>
      <Link to="/" className="text-brand-700 underline dark:text-brand-300">
        {t('notFound.home')}
      </Link>
    </>
  );
}
