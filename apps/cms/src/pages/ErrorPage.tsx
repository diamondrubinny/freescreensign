import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';

/** Shown by the router error boundary. Never displays technical details. */
export function ErrorPage() {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto max-w-xl p-8">
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
