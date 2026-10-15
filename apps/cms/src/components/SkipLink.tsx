import { useTranslation } from 'react-i18next';

export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-brand-700 px-4 py-2 text-white focus:not-sr-only focus:absolute focus:start-2 focus:top-2"
    >
      {t('nav.skipToContent')}
    </a>
  );
}
