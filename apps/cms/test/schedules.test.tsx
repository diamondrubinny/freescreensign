import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleEditorPage } from '../src/pages/ScheduleEditorPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const LAYOUT = '44444444-4444-4444-8444-444444444444';
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
  memberships: [{ orgId: ORG, orgName: 'Org', role: 'EDITOR' }],
};

const entry = (patch: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  layoutId: LAYOUT,
  layoutName: 'Lunch layout',
  playlistId: null,
  playlistName: null,
  dateFrom: null,
  dateTo: null,
  daysOfWeek: [],
  timeFrom: null,
  timeTo: null,
  enabled: true,
  ...patch,
});

const schedule = {
  id: SCHEDULE,
  name: 'Cafeteria',
  updatedAt: '2026-10-01T00:00:00Z',
  screens: [{ id: 's1', name: 'Lobby', timezone: 'UTC' }],
  entries: [
    entry({ name: 'Lunch', timeFrom: '11:00', timeTo: '15:00' }),
    entry({ name: 'Future', dateFrom: '2030-01-01' }),
  ],
};

beforeEach(() => {
  // Thursday 15 October 2026, 09:30 on the screen's clock (UTC).
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T09:30:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('schedule editor', () => {
  it('shows the week as text, warns about hidden entries, edits priorities and saves', async () => {
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/schedules/${SCHEDULE}`]: () => ({
        status: 200,
        body: { schedule },
      }),
      [`GET /api/v1/orgs/${ORG}/layouts`]: () => ({
        status: 200,
        body: {
          layouts: [
            {
              id: LAYOUT,
              name: 'Lunch layout',
              width: 1920,
              height: 1080,
              zones: [],
              zoneCount: 1,
              screenCount: 0,
              updatedAt: '',
            },
          ],
        },
      }),
      [`GET /api/v1/orgs/${ORG}/playlists`]: () => ({ status: 200, body: { playlists: [] } }),
      // Like the server: saved entries come back with new ids.
      [`PATCH /api/v1/orgs/${ORG}/schedules/${SCHEDULE}`]: (body) => {
        const { name, entries } = body as { name: string; entries: Record<string, unknown>[] };
        return {
          status: 200,
          body: {
            schedule: {
              ...schedule,
              name,
              updatedAt: '2026-10-15T09:31:00Z',
              entries: entries.map((e) => entry(e)),
            },
          },
        };
      },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/schedules/:scheduleId', element: <ScheduleEditorPage /> }],
      `/orgs/${ORG}/schedules/${SCHEDULE}`,
    );
    const user = userEvent.setup();

    const timeline = await screen.findByRole(
      'region',
      { name: 'מה יוצג השבוע' },
      { timeout: 5000 },
    );
    expect(
      within(timeline).getByText('לפי השעון של UTC. התצוגה מתעדכנת עוד לפני השמירה.'),
    ).toBeVisible();
    // Every day of the week, as text (the colored bars are hidden from assistive tech).
    expect(within(timeline).getAllByText('11:00–15:00 · Lunch')).toHaveLength(7);
    expect(within(timeline).getByText('עכשיו מוצג: התוכן הרגיל של המסך')).toBeVisible();
    expect(within(timeline).getByRole('status')).toHaveTextContent('Future');

    // A new entry defaults to 08:00–12:00 on the first layout, below existing entries.
    await user.click(screen.getByRole('button', { name: 'הוספת שורה' }));
    expect(within(timeline).getAllByText('08:00–11:00 · שורה 3')).toHaveLength(7);
    expect(within(timeline).getByText('עכשיו מוצג: שורה 3')).toBeVisible();

    // Moving it to the top gives it priority over lunch until noon.
    await user.click(screen.getByRole('button', { name: 'הזזת שורה 3 למעלה' }));
    await user.click(screen.getByRole('button', { name: 'הזזת שורה 3 למעלה' }));
    expect(within(timeline).getAllByText('08:00–12:00 · שורה 3')).toHaveLength(7);
    expect(within(timeline).getAllByText('12:00–15:00 · Lunch')).toHaveLength(7);

    // Fridays only.
    const first = screen.getByRole('group', { name: 'שורה 1: שורה 3' });
    await user.click(within(first).getByRole('checkbox', { name: 'יום ו׳' }));
    expect(within(timeline).getAllByText('08:00–12:00 · שורה 3')).toHaveLength(1);

    expect(screen.getByText('יש שינויים שלא נשמרו')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'שמירת הלוח' }));
    await waitFor(() => {
      expect(screen.getByText('הלוח נשמר. המסכים מתעדכנים.')).toBeVisible();
    });
    const body = calls.find((c) => c.key.startsWith('PATCH'))?.body as {
      name: string;
      entries: Record<string, unknown>[];
    };
    expect(body.name).toBe('Cafeteria');
    expect(body.entries).toEqual([
      {
        name: 'שורה 3',
        layoutId: LAYOUT,
        playlistId: null,
        dateFrom: null,
        dateTo: null,
        daysOfWeek: [5],
        timeFrom: '08:00',
        timeTo: '12:00',
        enabled: true,
      },
      expect.objectContaining({ name: 'Lunch', timeFrom: '11:00' }),
      expect.objectContaining({ name: 'Future', dateFrom: '2030-01-01' }),
    ]);
    // No local keys leak into the API.
    expect(Object.keys(body.entries[1]!)).not.toContain('key');
  });
});
