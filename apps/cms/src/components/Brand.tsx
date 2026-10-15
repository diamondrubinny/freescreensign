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
