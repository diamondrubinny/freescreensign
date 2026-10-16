import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertItem } from '../src/api/types';
import { AlertsPage } from '../src/pages/AlertsPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const session = (role: string) => ({
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'he',
    emailVerified: true,
    mfaEnabled: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [{ orgId: ORG, orgName: 'Org', role }],
});
const screens = [
  { id: 's1', name: 'Lobby' },
  { id: 's2', name: 'Gym' },
  { id: 's3', name: 'Hall' },
];
const active: AlertItem = {
  id: 'a1',
  style: 'emergency',
  title: 'פינוי מיידי',
  message: 'צאו מהבניין',
  screenIds: null,
  startsAt: '2026-10-16T09:00:00Z',
  endsAt: null,
  endedAt: null,
  active: true,
  createdBy: 'Dana',
  endedBy: null,
  createdAt: '2026-10-16T09:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('emergency alerts page', () => {
  it('fills a template, sends to chosen screens after confirming, and ends an alert', async () => {
    let list: { active: AlertItem[]; recent: AlertItem[] } = { active: [], recent: [] };
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/alerts`]: () => ({ status: 200, body: list }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens } }),
      [`POST /api/v1/orgs/${ORG}/alerts`]: () => {
        list = { active: [active], recent: [active] };
        return { status: 201, body: { alert: active, screens: 2 } };
      },
      [`POST /api/v1/orgs/${ORG}/alerts/a1/end`]: () => {
        const ended = {
          ...active,
          active: false,
          endedAt: '2026-10-16T09:05:00Z',
          endedBy: 'Dana',
        };
        list = { active: [], recent: [ended] };
        return { status: 200, body: { alert: ended } };
      },
    });
    renderRoutes([{ path: '/orgs/:orgId/alerts', element: <AlertsPage /> }], `/orgs/${ORG}/alerts`);
    const user = userEvent.setup();

    expect(await screen.findByText('אין התראות פעילות', {}, { timeout: 5000 })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'היכנסו למרחב המוגן' }));
    const title = screen.getByRole('textbox', { name: /^כותרת/ });
    expect(title).toHaveValue('היכנסו למרחב המוגן');
    expect(title).toHaveFocus();

    // Chosen screens: at least one is required.
    await user.click(screen.getByRole('radio', { name: 'מסכים נבחרים' }));
    await user.click(screen.getByRole('button', { name: 'הצגה במסכים' }));
    expect(screen.getByRole('alert')).toHaveTextContent('נא לבחור לפחות מסך אחד.');
    await user.click(screen.getByRole('checkbox', { name: 'Lobby' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hall' }));
    await user.selectOptions(screen.getByLabelText('משך'), 'שעתיים');

    // Nothing is sent before the confirmation (Hebrew dual form: "two screens").
    await user.click(screen.getByRole('button', { name: 'הצגה במסכים' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('להציג את "היכנסו למרחב המוגן" עכשיו בשני מסכים?');
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'הצגה במסכים' }));

    await waitFor(() => {
      expect(screen.getByText('ההתראה נשלחה לשני מסכים.')).toBeVisible();
    });
    expect(calls.find((c) => c.key === `POST /api/v1/orgs/${ORG}/alerts`)?.body).toEqual({
      style: 'emergency',
      title: 'היכנסו למרחב המוגן',
      message: 'היכנסו מיד למרחב המוגן הקרוב והישארו בו עד להודעה חדשה.',
      screenIds: ['s1', 's3'],
      durationMinutes: 120,
    });

    // The active alert, and ending it.
    const card = await screen.findByRole('heading', { level: 3, name: 'פינוי מיידי' });
    expect(card).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'סיום ההתראה: פינוי מיידי' }));
    await waitFor(() => {
      expect(
        screen.getByText('ההתראה "פינוי מיידי" הסתיימה. המסכים חוזרים לתוכן הרגיל.'),
      ).toBeVisible();
    });
    expect(await screen.findByText('הסתיימה (Dana)')).toBeVisible();
  });

  it('viewers see the alerts but cannot start or end them', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('VIEWER') }),
      [`GET /api/v1/orgs/${ORG}/alerts`]: () => ({
        status: 200,
        body: { active: [active], recent: [active] },
      }),
    });
    renderRoutes([{ path: '/orgs/:orgId/alerts', element: <AlertsPage /> }], `/orgs/${ORG}/alerts`);
    expect(
      await screen.findByRole('heading', { level: 3, name: 'פינוי מיידי' }, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /סיום ההתראה/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'הפעלת התראה' })).toBeNull();
  });
});
