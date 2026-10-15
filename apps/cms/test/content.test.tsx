import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutEditorPage } from '../src/pages/LayoutEditorPage';
import { LayoutsPage } from '../src/pages/LayoutsPage';
import { WidgetEditorPage } from '../src/pages/WidgetEditorPage';
import { readWidgetConfig, widgetDefaults } from '../src/pages/widget-fields';
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
const base = {
  'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
  [`GET /api/v1/orgs/${ORG}/widget-types`]: () => ({
    status: 200,
    body: {
      types: [{ type: 'clock', available: true, serverData: false }],
      weather: { enabled: false, attribution: 'x' },
    },
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('widget form helpers', () => {
  it('fills defaults from the shared schemas', () => {
    expect(widgetDefaults('clock')).toMatchObject({ format: '24h', showHebrewDate: true });
    expect(widgetDefaults('qr')).not.toHaveProperty('url');
  });

  it('reads checkboxes, scaled numbers and omits empty optional fields', () => {
    const data = new FormData();
    data.set('url', ' https://example.org/feed ');
    data.set('maxItems', '4');
    data.set('itemDurationMs', '6');
    data.set('textColor', '#FFFFFF');
    expect(readWidgetConfig('rss', data)).toEqual({
      url: 'https://example.org/feed',
      maxItems: 4,
      itemDurationMs: 6000,
      showSource: false,
      textColor: '#ffffff',
    });
  });
});

describe('WidgetEditorPage', () => {
  it('creates a clock widget with labelled, typed fields', async () => {
    const calls = mockApi({
      ...base,
      [`POST /api/v1/orgs/${ORG}/widgets`]: () => ({
        status: 201,
        body: {
          widget: {
            id: 'w1',
            type: 'clock',
            name: 'שעון לובי',
            config: {},
            usage: 0,
            updatedAt: '2026-10-15T10:00:00Z',
          },
        },
      }),
    });
    const { router } = renderRoutes(
      [
        { path: '/orgs/:orgId/widgets/new/:type', element: <WidgetEditorPage /> },
        { path: '/orgs/:orgId/widgets/:widgetId', element: <p>edited</p> },
      ],
      `/orgs/${ORG}/widgets/new/clock`,
    );
    const user = userEvent.setup();
    // Fields are enabled once the session confirms the editor role.
    await screen.findByRole('button', { name: 'Widget חדש' });
    const name = screen.getByLabelText(/שם ה-Widget/);
    await user.clear(name);
    await user.type(name, 'שעון לובי');
    await user.click(screen.getByLabelText('הצגת שניות'));
    await user.selectOptions(screen.getByLabelText('תצוגת שעה'), '12h');
    await user.click(screen.getByRole('button', { name: 'Widget חדש' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orgs/${ORG}/widgets/w1`);
    });
    const body = calls.find((c) => c.key.startsWith('POST'))?.body;
    expect(body).toEqual({
      type: 'clock',
      name: 'שעון לובי',
      config: {
        format: '12h',
        showSeconds: true,
        showDate: true,
        showHebrewDate: true,
        locale: 'he',
        textColor: '#ffffff',
        background: '#000000',
      },
    });
  });

  it('shows server errors next to the config field', async () => {
    mockApi({
      ...base,
      [`POST /api/v1/orgs/${ORG}/widgets`]: () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: [{ path: 'config.url', reason: 'own_origin' }],
          },
        },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/widgets/new/:type', element: <WidgetEditorPage /> }],
      `/orgs/${ORG}/widgets/new/webpage`,
    );
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Widget חדש' });
    const url = screen.getByLabelText(/כתובת \(URL\)/);
    await user.type(url, 'https://signage.example.com/');
    await user.click(screen.getByRole('button', { name: 'Widget חדש' }));
    expect(
      await screen.findByText('הכתובת שייכת למערכת עצמה ואי אפשר להציג אותה במסך.'),
    ).toBeInTheDocument();
    expect(url).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('LayoutEditorPage', () => {
  const layout = {
    id: 'l1',
    name: 'לובי',
    width: 1920,
    height: 1080,
    background: '#000000',
    updatedAt: '2026-10-15T10:00:00Z',
    screens: [],
    zones: [
      { id: 'z1', name: 'ראשי', x: 0, y: 0, w: 1920, h: 950, z: 0, playlistId: null },
      { id: 'z2', name: 'טקסט רץ', x: 0, y: 950, w: 1920, h: 130, z: 1, playlistId: null },
    ],
  };

  it('edits zones with a form and saves them in one request', async () => {
    const calls = mockApi({
      ...base,
      [`GET /api/v1/orgs/${ORG}/layouts/l1`]: () => ({ status: 200, body: { layout } }),
      [`GET /api/v1/orgs/${ORG}/playlists`]: () => ({
        status: 200,
        body: {
          playlists: [{ id: 'p1', name: 'חדשות', itemCount: 1, screenCount: 0, updatedAt: '' }],
        },
      }),
      [`PATCH /api/v1/orgs/${ORG}/layouts/l1`]: (body) => ({
        status: 200,
        body: { layout: { ...layout, ...(body as object) } },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/layouts/:layoutId', element: <LayoutEditorPage /> }],
      `/orgs/${ORG}/layouts/l1`,
    );
    const user = userEvent.setup();
    const ticker = await screen.findByRole('group', { name: /אזור 2/ });
    await user.selectOptions(within(ticker).getByLabelText('פלייליסט'), 'p1');
    const height = within(ticker).getByLabelText('גובה');
    await user.clear(height);
    await user.type(height, '120');
    expect(screen.getByRole('status')).toHaveTextContent('יש שינויים שלא נשמרו.');
    expect(screen.getByRole('img', { name: /ראשי, טקסט רץ/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'שמירת התבנית' }));
    expect(await screen.findByText('התבנית נשמרה והמסכים עודכנו.')).toBeInTheDocument();
    const body = calls.find((c) => c.key.startsWith('PATCH'))?.body as {
      zones: { h: number; playlistId: string | null }[];
    };
    expect(body.zones[1]).toMatchObject({ h: 120, playlistId: 'p1' });
    expect(body.zones[0]).not.toHaveProperty('id');
  });
});

describe('LayoutsPage', () => {
  const routes = [
    { path: '/orgs/:orgId/layouts', element: <LayoutsPage /> },
    { path: '/orgs/:orgId/layouts/:layoutId', element: <p>editor</p> },
  ];
  const list = {
    [`GET /api/v1/orgs/${ORG}/layouts`]: () => ({ status: 200, body: { layouts: [] } }),
  };

  it('creates a starter kit in the interface language', async () => {
    const calls = mockApi({
      ...base,
      ...list,
      [`POST /api/v1/orgs/${ORG}/starter-kits/menu`]: () => ({
        status: 201,
        body: { layout: { id: 'k1' } },
      }),
    });
    const { router } = renderRoutes(routes, `/orgs/${ORG}/layouts`);
    const user = userEvent.setup();
    await screen.findByText('תבנית חדשה', {}, { timeout: 5000 });
    await user.click(
      await screen.findByRole('button', { name: 'יצירת ערכה תפריט' }, { timeout: 5000 }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/orgs/${ORG}/layouts/k1`);
    });
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({ locale: 'he' });
  });

  it('picks a template with accessible radio buttons', async () => {
    const calls = mockApi({
      ...base,
      ...list,
      [`POST /api/v1/orgs/${ORG}/layouts`]: () => ({ status: 201, body: { layout: { id: 'l9' } } }),
    });
    renderRoutes(routes, `/orgs/${ORG}/layouts`);
    const user = userEvent.setup();
    const grid = await screen.findByRole('radio', { name: 'רשת 2×2' }, { timeout: 5000 });
    expect(screen.getByRole('radio', { name: 'ראשי + טקסט רץ' })).toBeChecked();
    await user.click(grid);
    expect(grid).toBeChecked();
    await user.type(screen.getByLabelText(/שם התבנית/), 'רשת');
    await user.click(screen.getByRole('button', { name: 'תבנית חדשה' }));
    await waitFor(() => {
      expect(calls.some((c) => c.key.startsWith('POST'))).toBe(true);
    });
    const body = calls.find((c) => c.key.startsWith('POST'))?.body as {
      zones: { name: string }[];
    };
    expect(body.zones.map((z) => z.name)).toEqual([
      'עליון שמאלי',
      'עליון ימני',
      'תחתון שמאלי',
      'תחתון ימני',
    ]);
  });
});
