import { useEffect, useRef, type ReactNode, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import type { FormErrors } from '../lib/api-errors';

interface Props {
  onSubmit: (data: FormData) => void;
  errors: FormErrors;
  children: ReactNode;
  className?: string;
  /** Accessible name for the form (e.g. the section heading id). */
  labelledBy?: string;
}

/**
 * Form wrapper: native validation is disabled in favour of server messages, and
 * after a failed submit focus moves to the first invalid field (or the error).
 */
export function Form({ onSubmit, errors, children, className = '', labelledBy }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fieldCount = Object.keys(errors.fields).length;

  useEffect(() => {
    if (fieldCount > 0) {
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    } else if (errors.form) {
      errorRef.current?.focus();
    }
  }, [errors, fieldCount]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  };

  return (
    <form
      ref={ref}
      noValidate
      onSubmit={handleSubmit}
      className={`flex flex-col gap-4 ${className}`}
      aria-labelledby={labelledBy}
    >
      {(errors.form ?? fieldCount > 0) && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant={errors.form ? errors.variant : 'error'}>
            {errors.form ?? t('validation.summary')}
          </Alert>
        </div>
      )}
      {children}
    </form>
  );
}

/** Reads a trimmed string value from FormData. */
export function value(data: FormData, name: string): string {
  const raw = data.get(name);
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Reads a password value without trimming (spaces are significant). */
export function rawValue(data: FormData, name: string): string {
  const raw = data.get(name);
  return typeof raw === 'string' ? raw : '';
}
