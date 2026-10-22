// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useTranslation } from 'react-i18next';
import { ATTRIBUTION, poweredBy } from '@rubinny/shared';
import { PageHeading } from '../components/PageHeading';

declare const __CMS_VERSION__: string;

/** What Rubinny is, its license and where its source code is (the attribution, LICENSING.md). */
export function AboutPage() {
  const { t, i18n } = useTranslation();
  const link = 'underline hover:no-underline';
  return (
    <article>
      <PageHeading title={t('about.title')} />
      <p className="mb-4 text-lg font-semibold" data-testid="about-powered-by">
        {poweredBy(i18n.language)}
      </p>
      <p className="mb-6">{t('about.intro')}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="font-medium">{t('about.version')}</dt>
        <dd>
          <bdi dir="ltr">{__CMS_VERSION__}</bdi>
        </dd>
        <dt className="font-medium">{t('about.license')}</dt>
        <dd>{t('about.licenseText')}</dd>
        <dt className="font-medium">{t('about.source')}</dt>
        <dd>
          <a href={ATTRIBUTION.sourceUrl} className={link} rel="noopener noreferrer" dir="ltr">
            {ATTRIBUTION.sourceUrl.replace('https://', '')}
          </a>
        </dd>
        <dt className="font-medium">{t('about.createdBy')}</dt>
        <dd>{ATTRIBUTION.author}</dd>
      </dl>
      <p className="mt-6 text-sm text-gray-700 dark:text-gray-300">
        {ATTRIBUTION.copyright}. {t('about.keep')}
      </p>
    </article>
  );
}
