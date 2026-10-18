import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreensPage } from '../src/pages/ScreensPage';
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
    hasPassword: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [
    { orgId: ORG, name: 'Org', role: 'ADMIN', requireAdminMfa: false, requireApproval: false },
  ],
};
const hall = {
  id: SCREEN,
  name: 'אולם',
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
  playerVersion: '0.4.0',
  resolution: '1920x1080',
  clockOffsetMs: 0,
  wall: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('video wall settings', () => {
  it('places a screen in a wall with 1-based cells, and shows its place in the list', async () => {
    let current: Record<string, unknown> = hall;
    const list = (key: string) => () => ({ status: 200, body: { [key]: [] } });
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens: [current] } }),
      [`GET /api/v1/orgs/${ORG}/playlists`]: list('playlists'),
      [`GET /api/v1/orgs/${ORG}/layouts`]: list('layouts'),
      [`GET /api/v1/orgs/${ORG}/schedules`]: list('schedules'),
      [`PATCH /api/v1/orgs/${ORG}/screens/${SCREEN}`]: (body) => {
        current = { ...hall, ...(body as object) };
        return { status: 200, body: { screen: current } };
      },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/screens', element: <ScreensPage /> }],
      `/orgs/${ORG}/screens`,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /^עריכה\s*אולם$/ }, { timeout: 5000 }),
    );
    const dialog = screen.getByRole('dialog', { name: 'עריכת מסך' });
    const wall = within(dialog).getByRole('group', { name: 'קיר וידאו' });
    expect(within(wall).queryByLabelText(/עמודות בקיר/)).toBeNull();
    await user.click(within(wall).getByRole('checkbox', { name: 'המסך הוא חלק מקיר וידאו' }));
    await user.clear(within(wall).getByLabelText(/העמודה של המסך/));
    await user.type(within(wall).getByLabelText(/העמודה של המסך/), '2');
    await user.type(within(wall).getByLabelText(/לרוחב/), '0');
    await user.clear(within(wall).getByLabelText(/לרוחב/));
    await user.type(within(wall).getByLabelText(/לרוחב/), '24');
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));

    const body = calls.find((c) => c.key.startsWith('PATCH'))?.body as { wall: unknown };
    expect(body.wall).toEqual({ columns: 2, rows: 1, column: 1, row: 0, bezelX: 24, bezelY: 0 });
    expect(await screen.findByText('קיר וידאו 2×1: עמודה 2, שורה 1')).toBeVisible();
  });

  it('leaves the wall when the box is cleared', async () => {
    const placed = {
      ...hall,
      wall: { columns: 2, rows: 1, column: 0, row: 0, bezelX: 0, bezelY: 0 },
    };
    const list = (key: string) => () => ({ status: 200, body: { [key]: [] } });
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens: [placed] } }),
      [`GET /api/v1/orgs/${ORG}/playlists`]: list('playlists'),
      [`GET /api/v1/orgs/${ORG}/layouts`]: list('layouts'),
      [`GET /api/v1/orgs/${ORG}/schedules`]: list('schedules'),
      [`PATCH /api/v1/orgs/${ORG}/screens/${SCREEN}`]: () => ({
        status: 200,
        body: { screen: { ...placed, wall: null } },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/screens', element: <ScreensPage /> }],
      `/orgs/${ORG}/screens`,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /^עריכה\s*אולם$/ }, { timeout: 5000 }),
    );
    const dialog = screen.getByRole('dialog', { name: 'עריכת מסך' });
    expect(within(dialog).getByLabelText(/העמודה של המסך/)).toHaveValue(1);
    await user.click(within(dialog).getByRole('checkbox', { name: 'המסך הוא חלק מקיר וידאו' }));
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(calls.find((c) => c.key.startsWith('PATCH'))?.body).toMatchObject({ wall: null });
  });
});

describe('screen time zone', () => {
  it('picks the time zone from a labelled list and shows the server’s error next to it', async () => {
    const list = (key: string) => () => ({ status: 200, body: { [key]: [] } });
    let attempt = 0;
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens: [hall] } }),
      [`GET /api/v1/orgs/${ORG}/playlists`]: list('playlists'),
      [`GET /api/v1/orgs/${ORG}/layouts`]: list('layouts'),
      [`GET /api/v1/orgs/${ORG}/schedules`]: list('schedules'),
      [`PATCH /api/v1/orgs/${ORG}/screens/${SCREEN}`]: (body) =>
        ++attempt === 1
          ? {
              status: 400,
              body: {
                error: {
                  code: 'VALIDATION_FAILED',
                  message: 'Invalid request',
                  fields: [{ path: 'timezone', reason: 'invalid' }],
                },
              },
            }
          : { status: 200, body: { screen: { ...hall, ...(body as object) } } },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/screens', element: <ScreensPage /> }],
      `/orgs/${ORG}/screens`,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /^עריכה\s*אולם$/ }, { timeout: 5000 }),
    );
    const dialog = screen.getByRole('dialog', { name: 'עריכת מסך' });
    const zone = within(dialog).getByLabelText('אזור זמן');
    expect(zone).toHaveValue('Asia/Jerusalem');
    expect(zone).toHaveAccessibleDescription(/תזמון וחלונות זמן/);
    await user.selectOptions(zone, 'Europe/London');
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    expect(await within(dialog).findByLabelText('אזור זמן')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    const bodies = calls.filter((c) => c.key.startsWith('PATCH')).map((c) => c.body);
    expect(bodies.at(-1)).toMatchObject({ timezone: 'Europe/London' });
  });
});
