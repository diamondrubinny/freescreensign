// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '../src/api/types';
import { AppShell } from '../src/components/AppShell';
import { OperatorStatusPage, type OperatorStatus } from '../src/pages/OperatorStatusPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const session = (user: Partial<SessionInfo['user']> = {}): SessionInfo => ({
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'he',
    emailVerified: true,
    mfaEnabled: true,
    hasPassword: true,
    isOperator: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...user,
  },
  memberships: [
    { orgId: ORG, name: 'Org', role: 'OWNER', requireAdminMfa: false, requireApproval: false },
  ],
});

const status: OperatorStatus = {
  checkedAt: '2026-10-18T10:00:00Z',
  version: { server: '0.5.0', migration: '0020_operator' },
  services: { state: 'ok', checks: { postgres: 'up', redis: 'up' } },
  clamav: {
    state: 'warning',
    configured: true,
    engine: '1.5.4',
    signatures: 28150,
    signaturesDate: '2026-10-11T06:26:01Z',
  },
  backup: { state: 'error', lastAt: null },
  disk: {
    state: 'ok',
    freeBytes: 50_000_000_000,
    totalBytes: 100_000_000_000,
    databaseBytes: 20_000_000,
    mediaBytes: 3_000_000_000,
  },
  processing: { state: 'ok', waiting: 0, oldestAt: null },
  usage: { organizations: 3, users: 12, screens: 40, online: 38 },
  mail: { state: 'warning', transport: 'disabled' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server status page', () => {
  it('shows each item with its state in words, details and usage', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session() }),
      'GET /api/v1/operator/status': () => ({ status: 200, body: { status } }),
    });
    renderRoutes([{ path: '/operator', element: <OperatorStatusPage /> }], '/operator');
    const table = await screen.findByRole('table', { name: 'מצב השרת' });
    const row = (name: string) => within(table).getByRole('row', { name: new RegExp(name) });
    expect(row('אנטי-וירוס')).toHaveTextContent('לתשומת לב');
    expect(row('אנטי-וירוס')).toHaveTextContent('חתימות 28150');
    expect(row('גיבוי אחרון')).toHaveTextContent('תקלה');
    expect(row('גיבוי אחרון')).toHaveTextContent('לא נרשם גיבוי');
    expect(row('שירותים')).toHaveTextContent('תקין');
    expect(row('דואר יוצא')).toHaveTextContent('לא מוגדר');
    const usage = screen.getByRole('region', { name: 'שימוש' });
    expect(within(usage).getByText('מסכים מחוברים').nextSibling).toHaveTextContent('38');
    expect(screen.getByText(/Rubinny 0\.5\.0 · 0020_operator/)).toBeVisible();
  });

  it('asks an operator without two-step verification to turn it on', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session({ mfaEnabled: false }) }),
      'GET /api/v1/operator/status': () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } },
      }),
    });
    renderRoutes([{ path: '/operator', element: <OperatorStatusPage /> }], '/operator');
    expect(await screen.findByText(/הדף דורש אימות דו-שלבי/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'החשבון שלי' })).toHaveAttribute('href', '/account');
  });

  it('is in the menu only for the operator', async () => {
    for (const isOperator of [true, false]) {
      mockApi({ 'GET /api/v1/auth/session': () => ({ status: 200, body: session() }) });
      const { unmount } = renderRoutes(
        [{ path: '/', element: <AppShell session={session({ isOperator })} /> }],
        '/',
      );
      const nav = await screen.findByRole('navigation', { name: 'ניווט ראשי' });
      expect(within(nav).queryByRole('link', { name: 'מצב השרת' }) !== null).toBe(isOperator);
      unmount();
    }
  });
});
