import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { patch, post } from '../api/client';
import type { SessionInfo } from '../api/types';
import { AccessibilityMenu } from './AccessibilityMenu';
import { Brand } from './Brand';
import { Footer } from './Footer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SkipLink } from './SkipLink';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`;

/** Layout for signed-in pages: header, organization navigation and footer. */
export function AppShell({ session }: { session: SessionInfo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useParams();
  const orgSelectId = useId();

  const currentOrg = session.memberships.find((m) => m.orgId === orgId) ?? session.memberships[0];
  const isAdmin = currentOrg ? hasRole(currentOrg.role, 'ADMIN') : false;

  const logout = useMutation({
    mutationFn: () => post('/api/v1/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      void navigate('/login');
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-gray-300 px-4 py-3 dark:border-gray-700">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Brand />
          <div className="flex flex-wrap items-center gap-2">
            {session.memberships.length > 1 && currentOrg && (
              <div className="flex items-center gap-2">
                <label htmlFor={orgSelectId} className="text-sm">
                  {t('nav.switchOrg')}
                </label>
                <select
                  id={orgSelectId}
                  value={currentOrg.orgId}
                  onChange={(event) => void navigate(`/orgs/${event.target.value}`)}
                  className="rounded-md border border-gray-400 bg-white px-2 py-2 dark:bg-gray-900"
                >
                  {session.memberships.map((m) => (
                    <option key={m.orgId} value={m.orgId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <LanguageSwitcher
              onChange={(locale) => {
                // Persist the choice on the account too (best effort).
                void patch('/api/v1/me', { locale }).catch(() => undefined);
              }}
            />
            <AccessibilityMenu />
            <button
              type="button"
              onClick={() => {
                logout.mutate();
              }}
              className="rounded-md border border-gray-400 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
        <nav aria-label={t('nav.main')} className="md:w-56 md:shrink-0">
          <ul className="flex flex-wrap gap-1 md:flex-col">
            <li>
              <NavLink to="/" end className={navClass}>
                {t('nav.dashboard')}
              </NavLink>
            </li>
            {currentOrg && (
              <>
                <li>
                  <NavLink to={`/orgs/${currentOrg.orgId}/screens`} className={navClass}>
                    {t('screens.nav')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to={`/orgs/${currentOrg.orgId}/playlists`} className={navClass}>
                    {t('playlists.nav')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to={`/orgs/${currentOrg.orgId}/media`} className={navClass}>
                    {t('media.nav')}
                  </NavLink>
                </li>
              </>
            )}
            {currentOrg && isAdmin && (
              <>
                <li>
                  <NavLink to={`/orgs/${currentOrg.orgId}/members`} className={navClass}>
                    {t('nav.members')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to={`/orgs/${currentOrg.orgId}/settings`} className={navClass}>
                    {t('nav.settings')}
                  </NavLink>
                </li>
                <li>
                  <NavLink to={`/orgs/${currentOrg.orgId}/audit`} className={navClass}>
                    {t('nav.audit')}
                  </NavLink>
                </li>
              </>
            )}
            <li>
              <NavLink to="/account" className={navClass}>
                {t('nav.account')}
              </NavLink>
            </li>
          </ul>
        </nav>
        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
