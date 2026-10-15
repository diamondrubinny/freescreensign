import type { TFunction } from 'i18next';
import { ApiError } from '../api/client';

const REASON_KEYS = new Set([
  'required',
  'invalid_format',
  'too_short',
  'too_long',
  'too_common',
  'contains_email',
]);

/** Maps zod / password-policy reasons from the API to translated messages. */
function reasonMessage(t: TFunction, reason: string): string {
  if (reason === 'too_small' || reason === 'invalid_type') return t('validation.required');
  if (reason === 'too_big') return t('validation.too_long');
  if (REASON_KEYS.has(reason)) {
    return t(
      `validation.${reason as 'required' | 'invalid_format' | 'too_short' | 'too_long' | 'too_common' | 'contains_email'}`,
    );
  }
  return t('validation.invalid');
}

export interface FormErrors {
  /** Error shown above the form (role="alert"), or null. */
  form: string | null;
  /** Per-field messages keyed by API field path. */
  fields: Record<string, string>;
}

export function toFormErrors(t: TFunction, error: unknown): FormErrors {
  if (!error) return { form: null, fields: {} };
  if (!(error instanceof ApiError)) return { form: t('errors.INTERNAL_ERROR'), fields: {} };
  if (error.code === 'NETWORK') return { form: t('errors.network'), fields: {} };

  const fields: Record<string, string> = {};
  for (const field of error.fields) fields[field.path] = reasonMessage(t, field.reason);

  if (error.code === 'VALIDATION_FAILED' && Object.keys(fields).length > 0) {
    return { form: null, fields };
  }
  let form = t(`errors.${error.code}`);
  if (error.code === 'INTERNAL_ERROR' && error.requestId) {
    form += ` ${t('errors.reference', { id: error.requestId })}`;
  }
  return { form, fields };
}
