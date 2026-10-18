import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaylistEditorPage } from '../src/pages/PlaylistEditorPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
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
const always = { dateFrom: null, dateTo: null, daysOfWeek: [], timeFrom: null, timeTo: null };
const widgetItem = (widgetId: string, name: string, window: unknown) => ({
  kind: 'widget',
  widgetId,
  widgetType: 'text',
  name,
  durationMs: null,
  effectiveDurationMs: 15_000,
  window,
});
const playlist = {
  id: 'p1',
  name: 'לובי',
  updatedAt: '2026-10-18T00:00:00Z',
  screens: [],
  items: [
    widgetItem('w1', 'ארוחת צהריים', {
      ...always,
      daysOfWeek: [0, 4],
      timeFrom: '11:30',
      timeTo: '13:30',
    }),
    widgetItem('w2', 'יום פתוח', { ...always, dateTo: '2020-01-01' }),
    widgetItem('w3', 'ברוכים הבאים', null),
  ],
};
const routes = (put: (body: unknown) => { status: number; body?: unknown }) => ({
  'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
  [`GET /api/v1/orgs/${ORG}/playlists/p1`]: () => ({ status: 200, body: { playlist } }),
  [`GET /api/v1/orgs/${ORG}/media`]: () => ({ status: 200, body: { media: [] } }),
  [`GET /api/v1/orgs/${ORG}/widgets`]: () => ({ status: 200, body: { widgets: [] } }),
  [`PUT /api/v1/orgs/${ORG}/playlists/p1/items`]: put,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playlist item time windows', () => {
  it('shows each window in words, and edits one with labelled fields', async () => {
    const calls = mockApi(routes(() => ({ status: 200, body: { playlist } })));
    renderRoutes(
      [{ path: '/orgs/:orgId/playlists/:playlistId', element: <PlaylistEditorPage /> }],
      `/orgs/${ORG}/playlists/p1`,
    );
    const user = userEvent.setup();
    const [lunch, openDay, welcome] = await screen.findAllByRole('listitem');
    // In words, not by color alone.
    expect(lunch).toHaveTextContent(/מתוזמן:.*11:30–13:30/);
    expect(openDay).toHaveTextContent('הסתיים, לא יוצג יותר');
    expect(welcome).not.toHaveTextContent('מתוזמן');

    const toggle = within(welcome!).getByRole('button', { name: /מתי להציג\s*ברוכים הבאים/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const fields = screen.getByRole('group', { name: 'מתי להציג את ברוכים הבאים' });
    expect(toggle).toHaveAttribute('aria-controls', fields.id);
    await user.click(within(fields).getByRole('checkbox', { name: 'יום ו׳' }));
    await user.click(within(fields).getByRole('checkbox', { name: 'כל היום' }));
    expect(welcome).toHaveTextContent(/מתוזמן:.*08:00–12:00/);

    // Back to "always" for the lunch item: no window is sent for it.
    await user.click(within(lunch!).getByRole('button', { name: /מתי להציג/ }));
    await user.click(
      within(screen.getByRole('group', { name: 'מתי להציג את ארוחת צהריים' })).getByRole('button', {
        name: 'להציג תמיד',
      }),
    );
    expect(lunch).not.toHaveTextContent('מתוזמן');

    await user.click(screen.getByRole('button', { name: 'שמירת הפלייליסט' }));
    await screen.findByText('הפלייליסט נשמר והמסכים עודכנו.');
    const body = calls.find((c) => c.key.startsWith('PUT'))?.body as {
      items: { widgetId: string; window: unknown }[];
    };
    expect(body.items.map((item) => item.window)).toEqual([
      null,
      { ...always, dateTo: '2020-01-01' },
      { ...always, daysOfWeek: [5], timeFrom: '08:00', timeTo: '12:00' },
    ]);
  });

  it('opens the window with an error and points the field at it', async () => {
    mockApi(
      routes(() => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid request',
            fields: [{ path: 'items.1.window.dateTo', reason: 'invalid' }],
          },
        },
      })),
    );
    renderRoutes(
      [{ path: '/orgs/:orgId/playlists/:playlistId', element: <PlaylistEditorPage /> }],
      `/orgs/${ORG}/playlists/p1`,
    );
    const user = userEvent.setup();
    const [, openDay] = await screen.findAllByRole('listitem');
    await user.click(within(openDay!).getByRole('button', { name: /הזזת יום פתוח למעלה/ }));
    await user.click(screen.getByRole('button', { name: 'שמירת הפלייליסט' }));
    // After the move, item 1 is the lunch notice: its window opens by itself.
    const fields = await screen.findByRole('group', { name: 'מתי להציג את ארוחת צהריים' });
    const dateTo = within(fields).getByLabelText('עד תאריך (כולל)');
    expect(dateTo).toHaveAttribute('aria-invalid', 'true');
    expect(dateTo).toHaveAccessibleDescription(/.+/);
  });
});
