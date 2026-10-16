import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalItem } from '../src/api/types';
import { ApprovalsPage } from '../src/pages/ApprovalsPage';
import { ScreensPage } from '../src/pages/ScreensPage';
import { WidgetEditorPage } from '../src/pages/WidgetEditorPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const WIDGET = '22222222-2222-4222-8222-222222222222';
const session = (role: string) => ({
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'he',
    emailVerified: true,
    mfaEnabled: true,
    hasPassword: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [
    { orgId: ORG, name: 'School', role, requireAdminMfa: false, requireApproval: true },
  ],
});
const request: ApprovalItem = {
  id: 'a1',
  status: 'pending',
  summary: { kind: 'widget', name: 'הודעות', action: 'update' },
  requestedBy: 'Noa',
  requestedById: 'u2',
  requestedAt: '2026-10-16T09:00:00Z',
  decidedBy: null,
  decidedAt: null,
  note: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('content approval', () => {
  it('admins approve and reject with a note; stale requests are explained', async () => {
    let pending = [
      request,
      { ...request, id: 'a2', summary: { ...request.summary, name: 'שעון' } },
    ];
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('ADMIN') }),
      [`GET /api/v1/orgs/${ORG}/approvals`]: () => ({ status: 200, body: { approvals: pending } }),
      [`GET /api/v1/orgs/${ORG}/approvals?status=decided`]: () => ({
        status: 200,
        body: { approvals: [] },
      }),
      [`POST /api/v1/orgs/${ORG}/approvals/a1/approve`]: () => {
        pending = pending.filter((p) => p.id !== 'a1');
        return { status: 200, body: { approval: { ...request, status: 'approved' } } };
      },
      [`POST /api/v1/orgs/${ORG}/approvals/a2/approve`]: () => ({
        status: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'x',
            fields: [{ path: 'approval', reason: 'not_found' }],
          },
        },
      }),
      [`POST /api/v1/orgs/${ORG}/approvals/a2/reject`]: () => {
        pending = [];
        return { status: 200, body: { approval: { ...request, id: 'a2', status: 'rejected' } } };
      },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/approvals', element: <ApprovalsPage /> }],
      `/orgs/${ORG}/approvals`,
    );
    const user = userEvent.setup();

    expect(await screen.findByText('Widget: הודעות', {}, { timeout: 5000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'אישור: Widget: הודעות' }));
    expect(await screen.findByText('השינוי אושר ועלה למסכים.')).toBeVisible();

    // The item was deleted since: the admin is told why, and can reject.
    await user.click(await screen.findByRole('button', { name: 'אישור: Widget: שעון' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('אי אפשר להחיל את השינוי');
    await user.click(screen.getByRole('button', { name: 'דחייה: Widget: שעון' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('הערה לעורך/ת (רשות)'), 'הפריט נמחק');
    await user.click(within(dialog).getByRole('button', { name: 'דחייה' }));
    await waitFor(() => {
      expect(screen.getByText('השינוי נדחה.')).toBeVisible();
    });
    expect(calls.find((c) => c.key.endsWith('/a2/reject'))?.body).toEqual({ note: 'הפריט נמחק' });
    expect(await screen.findByText('אין שינויים שממתינים לאישור')).toBeVisible();
  });

  it('editors see their requests and can only withdraw', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/approvals`]: () => ({
        status: 200,
        body: { approvals: [request] },
      }),
      [`GET /api/v1/orgs/${ORG}/approvals?status=decided`]: () => ({
        status: 200,
        body: { approvals: [{ ...request, id: 'a0', status: 'rejected', note: 'חסר חדר' }] },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/approvals', element: <ApprovalsPage /> }],
      `/orgs/${ORG}/approvals`,
    );
    expect(
      await screen.findByRole('button', { name: 'ביטול הבקשה: Widget: הודעות' }, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /^אישור/ })).toBeNull();
    expect(screen.getByText('חסר חדר')).toBeVisible();
  });

  it('tells an editor that a saved change waits for approval (not an error)', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/widget-types`]: () => ({
        status: 200,
        body: { types: [], weather: { enabled: false, attribution: '' } },
      }),
      [`GET /api/v1/orgs/${ORG}/widgets/${WIDGET}`]: () => ({
        status: 200,
        body: {
          widget: {
            id: WIDGET,
            type: 'text',
            name: 'הודעות',
            config: { text: 'שלום' },
            usage: 1,
            updatedAt: '2026-10-16T09:00:00Z',
          },
        },
      }),
      [`PATCH /api/v1/orgs/${ORG}/widgets/${WIDGET}`]: () => ({
        status: 202,
        body: { approval: request },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/widgets/:widgetId', element: <WidgetEditorPage /> }],
      `/orgs/${ORG}/widgets/${WIDGET}`,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'שמירת ה-Widget' }, { timeout: 5000 }),
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('השינוי נבדק ונשלח לאישור מנהל.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('editors pair screens without choosing content when approval is required', async () => {
    const list = (key: string) => () => ({ status: 200, body: { [key]: [] } });
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/screens`]: list('screens'),
      [`GET /api/v1/orgs/${ORG}/playlists`]: list('playlists'),
      [`GET /api/v1/orgs/${ORG}/layouts`]: list('layouts'),
      [`GET /api/v1/orgs/${ORG}/schedules`]: list('schedules'),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/screens', element: <ScreensPage /> }],
      `/orgs/${ORG}/screens`,
    );
    expect(await screen.findByText(/המסך יתווסף בלי תוכן/, {}, { timeout: 5000 })).toBeVisible();
    expect(document.querySelector('select[name="playlistId"]')).toBeNull();
  });
});
