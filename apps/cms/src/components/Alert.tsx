import type { ReactNode } from 'react';

type Variant = 'error' | 'success' | 'info' | 'warning';

const STYLES: Record<Variant, string> = {
  error: 'border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
  success: 'border-green-700 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
  info: 'border-blue-700 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  warning: 'border-amber-700 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100',
};

/**
 * Status message. Errors use role="alert" (assertive); others use role="status"
 * (polite). Meaning is conveyed by text, never by color alone.
 */
export function Alert({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-md border-s-4 px-4 py-3 ${STYLES[variant]}`}
    >
      {children}
    </div>
  );
}
