// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';

/** Shown by the router error boundary. Never displays technical details. */
export function ErrorPage() {
  const { t } = useTranslation();
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl p-8 focus:outline-none">
      <h1 className="mb-4 text-2xl font-bold">{t('errorPage.title')}</h1>
      <p className="mb-4">{t('errorPage.text')}</p>
      <Button
        onClick={() => {
          window.location.reload();
        }}
      >
        {t('errorPage.reload')}
      </Button>
    </main>
  );
}
