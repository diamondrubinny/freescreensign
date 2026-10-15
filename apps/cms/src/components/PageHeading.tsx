import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Page <h1>. Updates document.title and moves focus to the heading on mount, so
 * screen-reader and keyboard users land at the start of the new page after
 * client-side navigation.
 */
export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${title} · ${t('app.name')}`;
  }, [title, t]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, []);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 ref={ref} tabIndex={-1} className="text-2xl font-bold outline-none sm:text-3xl">
        {title}
      </h1>
      {children}
    </div>
  );
}
