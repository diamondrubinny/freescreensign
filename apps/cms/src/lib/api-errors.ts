import type { TFunction } from 'i18next';
import { ApiError } from '../api/client';

const REASON_KEYS = [
  'required',
  'invalid_format',
  'too_short',
  'too_long',
  'too_common',
  'contains_email',
  'unsupported_type',
  'out_of_bounds',
  'own_origin',
  'unavailable',
] as const;
type ReasonKey = (typeof REASON_KEYS)[number];

/** Maps zod / password-policy / upload reasons from the API to translated messages. */
function reasonMessage(t: TFunction, path: string, reason: string): string {
  if (reason === 'too_small' || reason === 'invalid_type') return t('validation.required');
  if (reason === 'too_big') return t('validation.too_long');
  // For files, "too large" is about bytes, not text length.
  if (reason === 'too_large' || (path === 'file' && reason === 'too_long')) {
    return t('validation.file_too_large');
  }
  if ((REASON_KEYS as readonly string[]).includes(reason))
    return t(`validation.${reason as ReasonKey}`);
  return t('validation.invalid');
}

export interface FormErrors {
  /** Error shown above the form (role="alert"), or null. */
  form: string | null;
  /** "info" when `form` is not a failure (the change waits for approval). */
  variant: 'error' | 'info';
  /** Per-field messages keyed by API field path. */
  fields: Record<string, string>;
}

export function toFormErrors(t: TFunction, error: unknown): FormErrors {
  if (!error) return { form: null, fields: {}, variant: 'error' };
  if (!(error instanceof ApiError)) {
    return { form: t('errors.INTERNAL_ERROR'), fields: {}, variant: 'error' };
  }
  if (error.code === 'NETWORK') return { form: t('errors.network'), fields: {}, variant: 'error' };
  if (error.code === 'APPROVAL_PENDING') {
    return { form: t('approvals.sent'), fields: {}, variant: 'info' };
  }

  const fields: Record<string, string> = {};
  for (const field of error.fields) fields[field.path] = reasonMessage(t, field.path, field.reason);

  if (error.code === 'VALIDATION_FAILED' && Object.keys(fields).length > 0) {
    return { form: null, fields, variant: 'error' };
  }
  let form = t(`errors.${error.code}`);
  if (error.code === 'INTERNAL_ERROR' && error.requestId) {
    form += ` ${t('errors.reference', { id: error.requestId })}`;
  }
  return { form, fields, variant: 'error' };
}
