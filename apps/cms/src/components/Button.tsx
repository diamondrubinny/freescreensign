import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'link';

const STYLES: Record<Variant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-400',
  secondary:
    'border border-gray-400 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-400',
  link: 'text-blue-700 underline hover:text-blue-900 dark:text-blue-300',
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
      : 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 font-medium';
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
