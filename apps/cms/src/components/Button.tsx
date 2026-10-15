import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'link';

const STYLES: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white shadow-sm hover:bg-brand-800 disabled:bg-brand-400 dark:bg-brand-600 dark:hover:bg-brand-500',
  secondary:
    'border border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
  danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 disabled:bg-red-400',
  link: 'text-brand-700 underline hover:text-brand-900 dark:text-brand-300',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  const base =
    variant === 'link'
      ? 'inline p-0'
      : 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors [&>svg]:size-4 [&>svg]:shrink-0';
  return (
    <button
      type={type}
      className={`${base} ${STYLES[variant]} disabled:cursor-not-allowed ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
