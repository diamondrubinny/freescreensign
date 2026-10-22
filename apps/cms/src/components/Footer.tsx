// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { useTranslation } from 'react-i18next';
import { ATTRIBUTION, poweredBy } from '@rubinny/shared';
import { Link } from 'react-router';
import { PrivacySettingsButton } from './PrivacySettings';

export const SOURCE_URL = ATTRIBUTION.sourceUrl;

/**
 * Footer with legal links and the "Powered by Rubinny" attribution, which must be
 * preserved in all versions (AGPL-3.0 section 7(b) term, see LICENSING.md).
 */
export function Footer() {
  const { t, i18n } = useTranslation();
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white px-4 py-6 text-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <nav aria-label={t('footer.footerNav')}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <Link to="/about" className="underline hover:no-underline">
                {t('footer.about')}
              </Link>
            </li>
            <li>
              <Link to="/accessibility" className="underline hover:no-underline">
                {t('footer.accessibility')}
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="underline hover:no-underline">
                {t('footer.privacy')}
              </Link>
            </li>
            <li>
              <Link to="/cookies" className="underline hover:no-underline">
                {t('footer.cookies')}
              </Link>
            </li>
            <li>
              <Link to="/terms" className="underline hover:no-underline">
                {t('footer.terms')}
              </Link>
            </li>
            <li>
              <PrivacySettingsButton />
            </li>
          </ul>
        </nav>
        <p data-testid="powered-by">
          <a href={SOURCE_URL} className="underline hover:no-underline" rel="noopener noreferrer">
            {poweredBy(i18n.language)}
          </a>{' '}
          · AGPL-3.0 ·{' '}
          <a href={SOURCE_URL} className="underline hover:no-underline" rel="noopener noreferrer">
            {t('footer.sourceCode')}
          </a>{' '}
          · <span data-testid="created-by">{t('footer.createdBy')}</span>
        </p>
      </div>
    </footer>
  );
}
