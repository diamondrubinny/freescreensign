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
