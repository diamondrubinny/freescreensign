// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { changeLocale } from '../src/i18n';
import { WidgetEditorPage } from '../src/pages/WidgetEditorPage';
import { readWidgetConfig } from '../src/pages/widget-fields';
import { ZmanimEditor } from '../src/pages/widgets/ZmanimEditor';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const WIDGET = '22222222-2222-4222-8222-222222222222';

const value = (): Record<string, unknown> => {
  const hidden = document.querySelector<HTMLInputElement>('input[type="hidden"][name="settings"]')!;
  return JSON.parse(hidden.value) as Record<string, unknown>;
};

function mount(initial?: unknown, errors: Record<string, string> = {}) {
  renderRoutes(
    [
      {
        path: '/orgs/:orgId/widgets/new/zmanim',
        element: <ZmanimEditor name="settings" initial={initial} errors={errors} />,
      },
    ],
    `/orgs/${ORG}/widgets/new/zmanim`,
  );
}

const session = {
  user: {
    id: 'u1',
    email: 'dana@example.com',
    name: 'Dana',
    locale: 'en',
    emailVerified: true,
    mfaEnabled: true,
    hasPassword: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [
    { orgId: ORG, name: 'Shul', role: 'ADMIN', requireAdminMfa: false, requireApproval: false },
  ],
};

function mountPage(type: string, config: Record<string, unknown>) {
  mockApi({
    'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
    [`GET /api/v1/orgs/${ORG}/widget-types`]: () => ({
      status: 200,
      body: { types: [], weather: { enabled: false, attribution: '' } },
    }),
    [`GET /api/v1/orgs/${ORG}/media?kind=image`]: () => ({
      status: 200,
      body: { media: [], nextCursor: null },
    }),
    [`GET /api/v1/orgs/${ORG}/widgets/${WIDGET}`]: () => ({
      status: 200,
      body: {
        widget: {
          id: WIDGET,
          type,
          name: 'Saved',
          config,
          usage: 0,
          updatedAt: '2026-10-16T09:00:00Z',
        },
      },
    }),
  });
  renderRoutes(
    [{ path: '/orgs/:orgId/widgets/:widgetId', element: <WidgetEditorPage /> }],
    `/orgs/${ORG}/widgets/${WIDGET}`,
  );
}

describe('zmanim editor', () => {
  beforeAll(async () => {
    await act(async () => {
      await changeLocale('en');
    });
  });
  afterAll(async () => {
    await act(async () => {
      await changeLocale('he');
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills the place from a city, chooses times and adds prayers', async () => {
    const user = userEvent.setup();
    mount();
    await user.selectOptions(screen.getByLabelText('Start from a city (optional)'), 'Jerusalem');
    expect(screen.getByLabelText('Place name')).toHaveValue('Jerusalem');
    await user.click(screen.getByLabelText('Dawn (Alot HaShachar)'));
    await user.click(screen.getByLabelText('Misheyakir'));

    await user.click(screen.getByRole('button', { name: 'Add prayer' }));
    await user.type(screen.getByLabelText('Prayer name'), 'Shacharit');
    await user.type(screen.getByLabelText('Time'), '06:30');
    await user.click(screen.getByRole('button', { name: 'Add prayer' }));
    await user.type(screen.getAllByLabelText('Prayer name')[1]!, 'Mincha');
    await user.selectOptions(screen.getAllByLabelText('When')[1]!, 'Relative to a time of the day');
    await user.selectOptions(screen.getByLabelText('Time of the day'), 'Sunset');
    await user.clear(screen.getByLabelText('Minutes (+ after, − before)'));
    await user.type(screen.getByLabelText('Minutes (+ after, − before)'), '-15');
    // Fridays only, then Sunday too (sent in order).
    await user.click(screen.getAllByLabelText('Friday')[1]!);
    await user.click(screen.getAllByLabelText('Sunday')[1]!);

    expect(value()).toEqual({
      place: {
        name: 'Jerusalem',
        latitude: 31.76904,
        longitude: 35.21633,
        timezone: 'Asia/Jerusalem',
        israel: true,
      },
      // In the order of the day: misheyakir was added, dawn removed.
      times: [
        'misheyakir',
        'sunrise',
        'sofZmanShma',
        'sofZmanTfilla',
        'chatzot',
        'minchaGedola',
        'plagHaMincha',
        'sunset',
        'tzeit',
      ],
      prayers: [
        { name: 'Shacharit', days: [], time: '06:30' },
        { name: 'Mincha', days: [0, 5], zman: 'sunset', offset: -15 },
      ],
    });

    // The form reads the settings as configuration keys.
    const data = new FormData();
    data.set('settings', JSON.stringify(value()));
    data.set('candleMinutes', '40');
    expect(readWidgetConfig('zmanim', data)).toMatchObject({
      place: { name: 'Jerusalem' },
      prayers: [{ name: 'Shacharit' }, { name: 'Mincha' }],
      candleMinutes: 40,
      showParasha: false,
    });
  });

  it('shows server errors next to the field they belong to', () => {
    mount(
      {
        place: { name: 'Shul', latitude: 95, longitude: 35, timezone: 'Asia/Jerusalem' },
        prayers: [{ name: 'Maariv', time: '' }],
      },
      { 'place.latitude': 'Too big', 'prayers.0.time': 'Expected HH:MM' },
    );
    expect(screen.getByLabelText('Latitude')).toHaveAccessibleDescription('Too big');
    expect(screen.getByLabelText('Latitude')).toHaveValue('95');
    expect(screen.getByLabelText('Time')).toHaveAccessibleDescription('Expected HH:MM');
  });

  it('opens a saved widget with its place and prayers', async () => {
    mountPage('zmanim', {
      place: {
        name: 'Beit Knesset',
        latitude: 32.08,
        longitude: 34.78,
        timezone: 'Asia/Jerusalem',
        israel: true,
      },
      times: ['sunrise', 'sunset'],
      prayers: [{ name: 'Maariv', days: [], zman: 'tzeit', offset: 0 }],
      candleMinutes: 20,
      havdalah: 'tzeit',
      showParasha: true,
      locale: 'en',
      format: '24h',
    });
    expect(await screen.findByLabelText('Place name', {}, { timeout: 5000 })).toHaveValue(
      'Beit Knesset',
    );
    expect(screen.getByLabelText('Prayer name')).toHaveValue('Maariv');
    expect(screen.getByLabelText('Sunrise')).toBeChecked();
    expect(screen.getByLabelText('Dawn (Alot HaShachar)')).not.toBeChecked();
    expect(screen.getByLabelText('Candle lighting: minutes before sunset')).toHaveValue(20);
  });

  it('opens a saved directory with its floors and entries (not an empty list)', async () => {
    mountPage('directory', {
      floors: [{ name: 'Ground' }, { name: '3' }],
      categories: [],
      entries: [{ name: 'Dental clinic', floor: '3', direction: 'up' }],
      idleSeconds: 60,
      pageSeconds: 10,
      locale: 'en',
    });
    expect(
      await screen.findByLabelText('Name (company, department or service)', {}, { timeout: 5000 }),
    ).toHaveValue('Dental clinic');
    expect(
      screen.getAllByLabelText('Floor name').map((x) => (x as HTMLInputElement).value),
    ).toEqual(['Ground', '3']);
  });
});
