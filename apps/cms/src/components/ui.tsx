import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Raised surface for grouped content. */
export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'section' | 'article';
}) {
  return (
    <Tag
      className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      {children}
    </Tag>
  );
}

/** A decorative icon in a tinted rounded square (hidden from assistive tech). */
export function IconTile({
  icon: Icon,
  tone = 'brand',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: 'brand' | 'green' | 'amber' | 'rose' | 'sky' | 'gray';
  size?: 'sm' | 'md' | 'lg';
}) {
  const tones = {
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
    sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  } as const;
  const sizes = {
    sm: 'size-8 [&>svg]:size-4',
    md: 'size-10 [&>svg]:size-5',
    lg: 'size-14 [&>svg]:size-7',
  };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${tones[tone]} ${sizes[size]}`}
    >
      <Icon />
    </span>
  );
}

/** Friendly placeholder for empty lists, with an optional call to action. */
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
      <IconTile icon={icon} size="lg" />
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="max-w-md text-gray-700 dark:text-gray-300">{text}</p>}
      {action}
    </div>
  );
}

/** Small status label. Meaning is always in the text; the dot is decorative. */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'green' | 'gray' | 'amber' | 'red' | 'brand';
  children: ReactNode;
}) {
  const tones = {
    green: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    red: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
    brand: 'bg-brand-100 text-brand-900 dark:bg-brand-950 dark:text-brand-200',
  } as const;
  const dots = {
    green: 'bg-green-600',
    gray: 'bg-gray-500',
    amber: 'bg-amber-600',
    red: 'bg-red-600',
    brand: 'bg-brand-600',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${tones[tone]}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  );
}

/** Section heading inside a page (h2) with optional description and actions. */
export function SectionHeading({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-xl font-bold">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

export const linkClass =
  'font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-2 dark:text-brand-300';

export const inputClass =
  'rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
