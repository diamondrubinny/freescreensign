import { Outlet } from 'react-router';
import { AccessibilityMenu } from './AccessibilityMenu';
import { Brand } from './Brand';
import { Footer } from './Footer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SkipLink } from './SkipLink';

/** Layout for signed-out pages (login, registration, legal pages). */
export function PublicShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <AccessibilityMenu />
          </div>
        </div>
      </header>
      <div className="relative flex-1 overflow-hidden">
        {/* Decorative background glow. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-gradient-to-b from-brand-200/60 to-transparent blur-3xl dark:from-brand-900/40"
        />
        <main
          id="main"
          className="relative mx-auto my-8 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm sm:px-10 dark:border-gray-800 dark:bg-gray-900"
        >
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
