// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreensPage } from '../src/pages/ScreensPage';
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
    hasPassword: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  memberships: [
    { orgId: ORG, name: 'Org', role: 'EDITOR', requireAdminMfa: false, requireApproval: false },
  ],
};
const screenItem = (id: string, name: string, groupIds: string[]) => ({
  id,
  name,
  playlistId: null,
  playlistName: null,
  layoutId: null,
  layoutName: null,
  scheduleId: null,
  scheduleName: null,
  orientation: 'landscape',
  timezone: 'Asia/Jerusalem',
  online: true,
  lastSeenAt: '2026-10-18T08:00:00Z',
  playerVersion: '0.5.0',
  resolution: '1920x1080',
  clockOffsetMs: 0,
  wall: null,
  groupIds,
});
const screens = [
  screenItem('s1', 'אולם', ['g1']),
  screenItem('s2', 'לובי', ['g1']),
  screenItem('s3', 'משרד', []),
];
const groups = [{ id: 'g1', name: 'קומה 2', screenIds: ['s1', 's2'] }];

afterEach(() => {
  vi.unstubAllGlobals();
});

function setUp() {
  const calls = mockApi({
    'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
    [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens } }),
    [`GET /api/v1/orgs/${ORG}/screen-groups`]: () => ({ status: 200, body: { groups } }),
    [`GET /api/v1/orgs/${ORG}/playlists`]: () => ({
      status: 200,
      body: {
        playlists: [{ id: 'p1', name: 'חדשות', itemCount: 1, screenCount: 0, updatedAt: '' }],
      },
    }),
    [`GET /api/v1/orgs/${ORG}/layouts`]: () => ({ status: 200, body: { layouts: [] } }),
    [`GET /api/v1/orgs/${ORG}/schedules`]: () => ({ status: 200, body: { schedules: [] } }),
    [`POST /api/v1/orgs/${ORG}/screen-groups`]: (body) => ({
      status: 201,
      body: { group: { id: 'g2', ...(body as object) } },
    }),
    [`PUT /api/v1/orgs/${ORG}/screen-groups/g1/content`]: () => ({
      status: 200,
      body: { group: groups[0], updated: 2 },
    }),
  });
  renderRoutes(
    [{ path: '/orgs/:orgId/screens', element: <ScreensPage /> }],
    `/orgs/${ORG}/screens`,
  );
  return { calls, user: userEvent.setup() };
}

describe('screen groups', () => {
  it('lists groups with their screens and filters the table by group', async () => {
    const { user } = setUp();
    const region = await screen.findByRole('region', { name: 'קבוצות מסכים' });
    expect(await within(region).findByText('שני מסכים: אולם, לובי')).toBeVisible();
    const table = screen.getByRole('table', { name: 'מסכים' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    await user.selectOptions(screen.getByLabelText('הצגת מסכים'), 'קומה 2');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByText('משרד')).toBeNull();
  });

  it('creates a group with checkboxes, and assigns content to it, keeping the rest', async () => {
    const { calls, user } = setUp();
    const region = await screen.findByRole('region', { name: 'קבוצות מסכים' });
    await user.click(within(region).getByRole('button', { name: 'קבוצה חדשה' }));
    const dialog = screen.getByRole('dialog', { name: 'קבוצה חדשה' });
    await user.type(within(dialog).getByLabelText(/שם הקבוצה/), 'משרדים');
    const choices = within(dialog).getByRole('group', { name: 'המסכים בקבוצה' });
    await user.click(within(choices).getByRole('checkbox', { name: 'משרד' }));
    await user.click(within(dialog).getByRole('button', { name: 'שמירת הקבוצה' }));
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({
      name: 'משרדים',
      screenIds: ['s3'],
    });

    await user.click(within(region).getByRole('button', { name: /שיוך תוכן\s*קומה 2/ }));
    const assign = screen.getByRole('dialog', { name: 'שיוך תוכן לקבוצה: קומה 2' });
    expect(within(assign).getByText('השינוי יחול על שני המסכים שבקבוצה, מיד.')).toBeVisible();
    expect(within(assign).getByLabelText('לוח זמנים')).toHaveValue('__keep__');
    await user.selectOptions(within(assign).getByLabelText('פלייליסט'), 'חדשות');
    await user.click(within(assign).getByRole('button', { name: 'שיוך לכל המסכים' }));
    expect(await screen.findByText('התוכן שויך לשני מסכים, והם מתעדכנים.')).toBeVisible();
    expect(calls.find((c) => c.key.startsWith('PUT'))?.body).toEqual({ playlistId: 'p1' });
  });
});
