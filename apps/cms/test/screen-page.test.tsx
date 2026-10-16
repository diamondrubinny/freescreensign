import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenDetailPage } from '../src/pages/ScreenDetailPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCREEN = '22222222-2222-4222-8222-222222222222';
const session = {
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'he',
    emailVerified: true,
    mfaEnabled: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [{ orgId: ORG, orgName: 'Org', role: 'VIEWER' }],
};
const screenItem = {
  id: SCREEN,
  name: 'מסך לובי',
  playlistId: null,
  playlistName: null,
  layoutId: null,
  layoutName: null,
  scheduleId: null,
  scheduleName: null,
  orientation: 'landscape',
  timezone: 'Asia/Jerusalem',
  online: true,
  lastSeenAt: '2026-10-16T08:00:00Z',
  playerVersion: '0.1.0',
  resolution: '1920x1080',
  clockOffsetMs: -300_000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('screen page', () => {
  it('shows uptime, a clock warning and what each zone shows', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens: [screenItem] } }),
      [`GET /api/v1/orgs/${ORG}/screens/${SCREEN}/status`]: () => ({
        status: 200,
        body: {
          status: {
            online: true,
            lastSeenAt: '2026-10-16T08:00:00Z',
            clockOffsetMs: -300_000,
            clockOk: false,
            uptime: { day: 0.975, week: null, hours: Array.from({ length: 24 }, () => 1) },
            platform: 'web',
            capabilities: [],
            screenshot: null,
            screenshotPending: false,
            layout: { kind: 'layout', name: 'לובי ראשי' },
            nowPlaying: [
              {
                zoneId: 'main',
                kind: 'media',
                id: 'm1',
                name: 'יום פתוח',
                mediaKind: 'image',
                thumbnailUrl: '/thumb.png',
              },
              { zoneId: 'side', kind: 'widget', id: 'w1', name: 'שעון', widgetType: 'clock' },
            ],
          },
        },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/screens/:screenId', element: <ScreenDetailPage /> }],
      `/orgs/${ORG}/screens/${SCREEN}`,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'מסך לובי' })).toBeVisible();
    expect(screen.getByText('97.5%')).toBeVisible();
    expect(screen.getByText('אין עדיין נתונים')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('שעון המכשיר סוטה ב-5 דקות');
    expect(screen.getByText('מציג: לובי ראשי')).toBeVisible();
    const zones = within(screen.getByRole('region', { name: 'מוצג עכשיו' })).getAllByRole(
      'listitem',
    );
    expect(zones.map((zone) => zone.textContent)).toEqual([
      'יום פתוחתמונה · אזור main',
      'שעוןשעון ותאריך · אזור side',
    ]);
    // A viewer cannot send commands to the screen.
    expect(screen.queryByRole('button', { name: 'רענון הנגן' })).toBeNull();
    // In a plain browser, screenshots are explained rather than offered.
    expect(screen.getByText(/צילום מסך מרחוק זמין כשהנגן רץ באפליקציית המחשב/)).toBeVisible();
  });

  it('takes a remote screenshot on a screen with a native wrapper', async () => {
    let shot: { takenAt: string; width: number; height: number } | null = null;
    let pending = false;
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({
        status: 200,
        body: { ...session, memberships: [{ orgId: ORG, orgName: 'Org', role: 'EDITOR' }] },
      }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens: [screenItem] } }),
      [`GET /api/v1/orgs/${ORG}/screens/${SCREEN}/status`]: () => ({
        status: 200,
        body: {
          status: {
            online: true,
            lastSeenAt: '2026-10-16T08:00:00Z',
            clockOffsetMs: 0,
            clockOk: true,
            uptime: { day: 1, week: 1, hours: [] },
            layout: null,
            nowPlaying: [],
            platform: 'electron',
            capabilities: ['screenshot'],
            screenshot: shot,
            screenshotPending: pending,
          },
        },
      }),
      [`POST /api/v1/orgs/${ORG}/screens/${SCREEN}/screenshot`]: () => {
        pending = false;
        shot = { takenAt: '2026-10-16T08:01:00Z', width: 1920, height: 1080 };
        return { status: 202, body: { requestId: 'r1' } };
      },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/screens/:screenId', element: <ScreenDetailPage /> }],
      `/orgs/${ORG}/screens/${SCREEN}`,
    );
    expect(await screen.findByText('אפליקציית מחשב')).toBeVisible();
    expect(screen.getByText('עדיין לא צולם מסך.')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'צילום מסך עכשיו' }));
    const image = await screen.findByRole('img', { name: /צילום מסך של מסך לובי/ });
    expect(image.getAttribute('src')).toContain(`/screens/${SCREEN}/screenshot?t=`);
    expect(calls.some((c) => c.key.startsWith('POST') && c.key.endsWith('/screenshot'))).toBe(true);
  });
});
