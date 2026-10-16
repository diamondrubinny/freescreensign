import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Blocks,
  CalendarClock,
  ChartColumn,
  Siren,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  ListVideo,
  LogOut,
  Menu,
  Monitor,
  ScrollText,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { hasRole } from '@rubinny/shared';
import { patch, post } from '../api/client';
import type { SessionInfo } from '../api/types';
import { AccessibilityMenu } from './AccessibilityMenu';
import { Brand } from './Brand';
import { Footer } from './Footer';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SkipLink } from './SkipLink';

// No color transitions: when the active link changes, animating text and background
// at once passes through low-contrast mixes (white or gray text on a half-faded
// background), which axe caught on CI. Colors switch instantly.
const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 font-medium ${
    isActive
      ? 'bg-brand-700 text-white shadow-sm dark:bg-brand-600'
      : 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
  }`;

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
}) {
  return (
    <li>
      <NavLink to={to} end={end ?? false} className={navClass}>
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span>{label}</span>
      </NavLink>
    </li>
  );
}

function NavGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p
        id={id}
        className="px-3 pt-4 pb-1 text-xs font-bold tracking-wider text-gray-600 uppercase dark:text-gray-400"
      >
        {title}
      </p>
      <ul aria-labelledby={id} className="flex flex-col gap-1">
        {children}
      </ul>
    </div>
  );
}

/** Layout for signed-in pages: header, grouped navigation (collapsible on mobile) and footer. */
export function AppShell({ session }: { session: SessionInfo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { orgId } = useParams();
  const orgSelectId = useId();
  const navId = useId();
  // The mobile menu stays open only on the page where it was opened (closes on navigation).
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === location.pathname;

  const currentOrg = session.memberships.find((m) => m.orgId === orgId) ?? session.memberships[0];
  const isAdmin = currentOrg ? hasRole(currentOrg.role, 'ADMIN') : false;
  const org = currentOrg ? `/orgs/${currentOrg.orgId}` : '';

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
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => {
                setOpenOn(menuOpen ? null : location.pathname);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 md:hidden dark:border-gray-600"
            >
              <Menu aria-hidden="true" className="size-5" />
              <span className="sr-only sm:not-sr-only">{t('nav.menu')}</span>
            </button>
            <Brand />
          </div>
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
                  className="rounded-lg border border-gray-300 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-900"
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
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
            >
              <LogOut aria-hidden="true" className="size-4" />
              {/* Icon only on phones: the header stays one row. */}
              <span className="sr-only sm:not-sr-only">{t('nav.logout')}</span>
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 md:flex-row">
        <nav
          id={navId}
          aria-label={t('nav.main')}
          className={`${menuOpen ? 'block' : 'hidden'} md:sticky md:top-20 md:block md:w-60 md:shrink-0 md:self-start`}
        >
          <ul className="flex flex-col gap-1">
            <NavItem to="/" end icon={LayoutDashboard} label={t('nav.dashboard')} />
          </ul>
          {currentOrg && (
            <>
              <NavGroup id={`${navId}-content`} title={t('nav.groupContent')}>
                <NavItem to={`${org}/media`} icon={Images} label={t('media.nav')} />
                <NavItem to={`${org}/playlists`} icon={ListVideo} label={t('playlists.nav')} />
                <NavItem to={`${org}/widgets`} icon={Blocks} label={t('widgets.nav')} />
                <NavItem to={`${org}/layouts`} icon={LayoutTemplate} label={t('layouts.nav')} />
                <NavItem to={`${org}/schedules`} icon={CalendarClock} label={t('schedules.nav')} />
              </NavGroup>
              <NavGroup id={`${navId}-devices`} title={t('nav.groupDevices')}>
                <NavItem to={`${org}/screens`} icon={Monitor} label={t('screens.nav')} />
                <NavItem to={`${org}/reports`} icon={ChartColumn} label={t('reports.nav')} />
                <NavItem to={`${org}/alerts`} icon={Siren} label={t('alerts.nav')} />
              </NavGroup>
            </>
          )}
          {currentOrg && isAdmin && (
            <NavGroup id={`${navId}-org`} title={t('nav.groupOrg')}>
              <NavItem to={`${org}/members`} icon={Users} label={t('nav.members')} />
              <NavItem to={`${org}/settings`} icon={Settings} label={t('nav.settings')} />
              <NavItem to={`${org}/audit`} icon={ScrollText} label={t('nav.audit')} />
            </NavGroup>
          )}
          <NavGroup id={`${navId}-personal`} title={t('nav.groupPersonal')}>
            <NavItem to="/account" icon={UserRound} label={t('nav.account')} />
          </NavGroup>
        </nav>
        {/* tabIndex -1: the skip link moves the keyboard focus here, not only the scroll. */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
