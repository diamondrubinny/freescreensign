import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Page <h1>. Updates document.title and moves focus to the heading on mount, so
 * screen-reader and keyboard users land at the start of the new page after
 * client-side navigation.
 */
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, []);

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1
          ref={ref}
          tabIndex={-1}
          className="text-2xl font-extrabold tracking-tight outline-none sm:text-3xl"
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-gray-700 dark:text-gray-300">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
