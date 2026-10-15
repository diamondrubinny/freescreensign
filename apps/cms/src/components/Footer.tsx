import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PrivacySettingsButton } from './PrivacySettings';

export const SOURCE_URL = 'https://github.com/diamondrubinny/freescreensign';

/**
 * Footer with legal links and the "Powered by Rubinny" attribution, which must be
 * preserved in all versions (AGPL-3.0 section 7(b) term, see LICENSING.md).
 */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white px-4 py-6 text-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <nav aria-label={t('footer.footerNav')}>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
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
            {t('footer.poweredBy')}
          </a>{' '}
          · AGPL-3.0 ·{' '}
          <a href={SOURCE_URL} className="underline hover:no-underline" rel="noopener noreferrer">
            {t('footer.sourceCode')}
          </a>
        </p>
      </div>
    </footer>
  );
}
