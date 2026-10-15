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
      <header className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            <AccessibilityMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
