// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createBrowserRouter, type RouteObject } from 'react-router';
import { PublicShell } from './components/PublicShell';
import { RequireAuth } from './components/RequireAuth';
import { DashboardPage } from './pages/DashboardPage';
import { ErrorPage } from './pages/ErrorPage';
import { Loading } from './components/Loading';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

/** Heavier, less frequently used pages are code-split and loaded on demand. */
const lazyPage = <K extends string>(
  load: () => Promise<Record<K, React.ComponentType>>,
  name: K,
) => ({
  lazy: async () => ({ Component: (await load())[name] }),
});

const legal = (doc: 'accessibility' | 'privacy' | 'cookies' | 'terms') => ({
  lazy: async () => {
    const { LegalPage } = await import('./pages/LegalPage');
    return { Component: () => <LegalPage doc={doc} /> };
  },
});

export const routes: RouteObject[] = [
  {
    errorElement: <ErrorPage />,
    // Shown while a code-split page loads on a direct visit.
    hydrateFallbackElement: <Loading />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'account', ...lazyPage(() => import('./pages/AccountPage'), 'AccountPage') },
          { path: 'orgs/:orgId', ...lazyPage(() => import('./pages/MembersPage'), 'MembersPage') },
          {
            path: 'orgs/:orgId/members',
            ...lazyPage(() => import('./pages/MembersPage'), 'MembersPage'),
          },
          {
            path: 'orgs/:orgId/settings',
            ...lazyPage(() => import('./pages/OrgSettingsPage'), 'OrgSettingsPage'),
          },
          {
            path: 'orgs/:orgId/screens',
            ...lazyPage(() => import('./pages/ScreensPage'), 'ScreensPage'),
          },
          {
            path: 'orgs/:orgId/screens/:screenId',
            ...lazyPage(() => import('./pages/ScreenDetailPage'), 'ScreenDetailPage'),
          },
          {
            path: 'orgs/:orgId/approvals',
            ...lazyPage(() => import('./pages/ApprovalsPage'), 'ApprovalsPage'),
          },
          {
            path: 'orgs/:orgId/alerts',
            ...lazyPage(() => import('./pages/AlertsPage'), 'AlertsPage'),
          },
          {
            path: 'orgs/:orgId/rooms',
            ...lazyPage(() => import('./pages/RoomsPage'), 'RoomsPage'),
          },
          {
            path: 'orgs/:orgId/reports',
            ...lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage'),
          },
          {
            path: 'orgs/:orgId/playlists',
            ...lazyPage(() => import('./pages/PlaylistsPage'), 'PlaylistsPage'),
          },
          {
            path: 'orgs/:orgId/playlists/:playlistId',
            ...lazyPage(() => import('./pages/PlaylistEditorPage'), 'PlaylistEditorPage'),
          },
          {
            path: 'orgs/:orgId/layouts',
            ...lazyPage(() => import('./pages/LayoutsPage'), 'LayoutsPage'),
          },
          {
            path: 'orgs/:orgId/layouts/:layoutId',
            ...lazyPage(() => import('./pages/LayoutEditorPage'), 'LayoutEditorPage'),
          },
          {
            path: 'orgs/:orgId/schedules',
            ...lazyPage(() => import('./pages/SchedulesPage'), 'SchedulesPage'),
          },
          {
            path: 'orgs/:orgId/schedules/:scheduleId',
            ...lazyPage(() => import('./pages/ScheduleEditorPage'), 'ScheduleEditorPage'),
          },
          {
            path: 'orgs/:orgId/widgets',
            ...lazyPage(() => import('./pages/WidgetsPage'), 'WidgetsPage'),
          },
          {
            path: 'orgs/:orgId/widgets/new/:type',
            ...lazyPage(() => import('./pages/WidgetEditorPage'), 'WidgetEditorPage'),
          },
          {
            path: 'orgs/:orgId/widgets/:widgetId',
            ...lazyPage(() => import('./pages/WidgetEditorPage'), 'WidgetEditorPage'),
          },
          {
            path: 'orgs/:orgId/media',
            ...lazyPage(() => import('./pages/MediaPage'), 'MediaPage'),
          },
          {
            path: 'orgs/:orgId/integrations',
            ...lazyPage(() => import('./pages/IntegrationsPage'), 'IntegrationsPage'),
          },
          {
            path: 'orgs/:orgId/audit',
            ...lazyPage(() => import('./pages/AuditPage'), 'AuditPage'),
          },
          {
            path: 'operator',
            ...lazyPage(() => import('./pages/OperatorStatusPage'), 'OperatorStatusPage'),
          },
        ],
      },
      {
        element: <PublicShell />,
        children: [
          { path: 'setup', ...lazyPage(() => import('./pages/SetupPage'), 'SetupPage') },
          { path: 'login', element: <LoginPage /> },
          { path: 'register', ...lazyPage(() => import('./pages/RegisterPage'), 'RegisterPage') },
          {
            path: 'verify-email',
            ...lazyPage(() => import('./pages/TokenPages'), 'VerifyEmailPage'),
          },
          {
            path: 'forgot-password',
            ...lazyPage(() => import('./pages/TokenPages'), 'ForgotPasswordPage'),
          },
          {
            path: 'reset-password',
            ...lazyPage(() => import('./pages/TokenPages'), 'ResetPasswordPage'),
          },
          {
            path: 'accept-invitation',
            ...lazyPage(() => import('./pages/TokenPages'), 'AcceptInvitationPage'),
          },
          { path: 'about', ...lazyPage(() => import('./pages/AboutPage'), 'AboutPage') },
          { path: 'accessibility', ...legal('accessibility') },
          { path: 'privacy', ...legal('privacy') },
          { path: 'cookies', ...legal('cookies') },
          { path: 'terms', ...legal('terms') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
