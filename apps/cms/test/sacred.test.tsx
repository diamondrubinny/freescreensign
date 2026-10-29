// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgSettingsPage } from '../src/pages/OrgSettingsPage';
import { ScheduleEditorPage } from '../src/pages/ScheduleEditorPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '33333333-3333-4333-8333-333333333333';
const LAYOUT = '44444444-4444-4444-8444-444444444444';
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

const JERUSALEM = {
  place: {
    name: 'ירושלים',
    latitude: 31.76904,
    longitude: 35.21633,
    timezone: 'Asia/Jerusalem',
    israel: true,
  },
  candleMinutes: 18,
  havdalah: 'tzeit',
  startOffsetMinutes: 30,
  endOffsetMinutes: 0,
};

// Friday 16 October 2026, 14:00 UTC, to Saturday 15:00 UTC.
const PERIOD = {
  start: '2026-10-16T14:00:00.000Z',
  end: '2026-10-17T15:00:00.000Z',
  kinds: ['shabbat'],
  names: [],
};
const TIMES = { periods: [PERIOD], until: '2026-12-01T00:00:00.000Z' };

beforeEach(() => {
  // Thursday 15 October 2026, 09:30 UTC.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T09:30:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Shabbat and holiday settings', () => {
  it('sets the place from a city, saves it and lists the coming periods', async () => {
    let saved: unknown = null;
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('ADMIN') }),
      [`GET /api/v1/orgs/${ORG}`]: () => ({
        status: 200,
        body: {
          org: {
            id: ORG,
            name: 'Org',
            role: 'ADMIN',
            requireAdminMfa: false,
            requireApproval: false,
            offlineAlerts: false,
            offlineAlertMinutes: 15,
          },
        },
      }),
      [`GET /api/v1/orgs/${ORG}/settings/sacred`]: () => ({
        status: 200,
        body: { settings: saved },
      }),
      [`PUT /api/v1/orgs/${ORG}/settings/sacred`]: (body) => {
        saved = (body as { settings: unknown }).settings;
        return { status: 200, body: { settings: saved } };
      },
      [`GET /api/v1/orgs/${ORG}/sacred-times?days=14`]: () => ({
        status: 200,
        body: { timeZone: 'Asia/Jerusalem', times: TIMES },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/settings', element: <OrgSettingsPage /> }],
      `/orgs/${ORG}/settings`,
    );
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'שבת וחגים' });
    // Admins only: the form is enabled once the role is known.
    const save = await within(section).findByRole('button', { name: 'שמירת ההגדרה' });
    expect(within(section).getByText(/לא מוגדר/)).toBeVisible();
    expect(within(section).getByText(/אינם פסק הלכה/)).toBeVisible();

    await user.selectOptions(
      within(section).getByRole('combobox', { name: 'עיר להתחלה (לא חובה)' }),
      'ירושלים',
    );
    expect(within(section).getByRole('textbox', { name: 'קו רוחב' })).toHaveValue('31.76904');
    const start = within(section).getByRole('spinbutton', {
      name: 'להתחיל לפני הדלקת הנרות (דקות)',
    });
    expect(start).toHaveAccessibleDescription(/בין 0 ל-180/);
    await user.clear(start);
    await user.type(start, '30');
    await user.click(save);

    await waitFor(() => {
      expect(within(section).getByText(/ההגדרה נשמרה/)).toBeVisible();
    });
    expect(calls.find((c) => c.key.startsWith('PUT'))?.body).toEqual({ settings: JERUSALEM });
    expect(within(section).getByText('מוגדר לפי ירושלים.')).toBeVisible();
    // The coming Shabbat, in the place's time (17:00 Friday to 18:00 Saturday in Jerusalem).
    const upcoming = await within(section).findByRole('listitem');
    expect(upcoming).toHaveTextContent(/^שבת: .*17:00 עד .*18:00$/);
  });

  it('shows server errors next to the field', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('ADMIN') }),
      [`GET /api/v1/orgs/${ORG}`]: () => ({
        status: 200,
        body: {
          org: {
            id: ORG,
            name: 'Org',
            role: 'ADMIN',
            requireAdminMfa: false,
            requireApproval: false,
            offlineAlerts: false,
            offlineAlertMinutes: 15,
          },
        },
      }),
      [`GET /api/v1/orgs/${ORG}/settings/sacred`]: () => ({
        status: 200,
        body: { settings: null },
      }),
      [`PUT /api/v1/orgs/${ORG}/settings/sacred`]: () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: [{ path: 'settings.place.latitude', reason: 'too_small' }],
          },
        },
      }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/settings', element: <OrgSettingsPage /> }],
      `/orgs/${ORG}/settings`,
    );
    const user = userEvent.setup();
    const section = await screen.findByRole('region', { name: 'שבת וחגים' });
    // Admins only: the form is enabled once the role is known.
    const save = await within(section).findByRole('button', { name: 'שמירת ההגדרה' });
    await user.click(save);
    const latitude = within(section).getByRole('textbox', { name: 'קו רוחב' });
    await waitFor(() => {
      expect(latitude).toHaveAttribute('aria-invalid', 'true');
    });
    expect(latitude).toHaveAccessibleDescription('יש למלא את השדה.');
  });
});

describe('the Shabbat and holiday condition in schedules', () => {
  const entry = (patch: Record<string, unknown>) => ({
    id: crypto.randomUUID(),
    layoutId: LAYOUT,
    layoutName: 'Closed',
    playlistId: null,
    playlistName: null,
    dateFrom: null,
    dateTo: null,
    daysOfWeek: [],
    timeFrom: null,
    timeTo: null,
    sacred: null,
    enabled: true,
    ...patch,
  });

  const api = (settings: unknown, entries: unknown[]) =>
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/schedules/${SCHEDULE}`]: () => ({
        status: 200,
        body: {
          schedule: {
            id: SCHEDULE,
            name: 'Shop',
            updatedAt: '2026-10-01T00:00:00Z',
            screens: [{ id: 's1', name: 'Window', timezone: 'UTC' }],
            entries,
          },
        },
      }),
      [`GET /api/v1/orgs/${ORG}/layouts`]: () => ({ status: 200, body: { layouts: [] } }),
      [`GET /api/v1/orgs/${ORG}/playlists`]: () => ({ status: 200, body: { playlists: [] } }),
      [`GET /api/v1/orgs/${ORG}/settings/sacred`]: () => ({ status: 200, body: { settings } }),
      // The week of Sunday 11 October, from the day before.
      [`GET /api/v1/orgs/${ORG}/sacred-times?from=2026-10-10&days=9`]: () => ({
        status: 200,
        body: { timeZone: 'Asia/Jerusalem', times: TIMES },
      }),
      [`PATCH /api/v1/orgs/${ORG}/schedules/${SCHEDULE}`]: () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: [{ path: 'entries.0.sacred', reason: 'sacred_unavailable' }],
          },
        },
      }),
    });

  const open = () =>
    renderRoutes(
      [{ path: '/orgs/:orgId/schedules/:scheduleId', element: <ScheduleEditorPage /> }],
      `/orgs/${ORG}/schedules/${SCHEDULE}`,
    );

  it('cannot be chosen before the place is set, and says where to set it', async () => {
    api(null, [entry({ name: 'Shabbat' })]);
    open();
    const field = await screen.findByRole('combobox', { name: 'שבת וחג' });
    await waitFor(() => {
      expect(field).toBeDisabled();
    });
    expect(field).toHaveAccessibleDescription(/צריך להגדיר מקום/);
    expect(screen.getByRole('link', { name: 'להגדרות הארגון' })).toHaveAttribute(
      'href',
      `/orgs/${ORG}/settings#sacred-heading`,
    );
  });

  it('marks Shabbat on the timeline and shows the rule in it, and the server error', async () => {
    api(JERUSALEM, [entry({ name: 'Shabbat', sacred: 'only' })]);
    open();
    const user = userEvent.setup();
    const timeline = await screen.findByRole('region', { name: 'מה יוצג השבוע' });
    // The period is written out on both days, and the rule plays exactly in it.
    expect(await within(timeline).findByText('שבת: 14:00–24:00')).toBeVisible();
    expect(within(timeline).getByText('שבת: 00:00–15:00')).toBeVisible();
    expect(within(timeline).getByText('14:00–24:00 · Shabbat')).toBeVisible();
    expect(within(timeline).getByText('00:00–15:00 · Shabbat')).toBeVisible();
    expect(within(timeline).getByText(/רצועה מפוספסת/)).toBeVisible();

    const field = screen.getByRole('combobox', { name: 'שבת וחג' });
    expect(field).toHaveValue('only');
    await user.selectOptions(field, 'לא בשבת וחג');
    // Outside Shabbat now: every other moment of the week.
    expect(within(timeline).getAllByText('00:00–24:00 · Shabbat')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'שמירת הלוח' }));
    await waitFor(() => {
      expect(field).toHaveAccessibleDescription(/הגדירו קודם מקום לשבת וחגים/);
    });
  });
});
