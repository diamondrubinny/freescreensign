import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toFormErrors, type FormErrors } from './api-errors';

export function useFormErrors(error: unknown): FormErrors {
  const { t } = useTranslation();
  return useMemo(() => toFormErrors(t, error), [t, error]);
}
