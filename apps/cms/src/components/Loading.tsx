import { useTranslation } from 'react-i18next';

export function Loading() {
  const { t } = useTranslation();
  return (
    <p role="status" className="p-8 text-center">
      {t('common.loading')}
    </p>
  );
}
