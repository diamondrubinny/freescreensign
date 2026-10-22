// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage, formatDuration } from '../src/pages/ReportsPage';
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
  memberships: [{ orgId: ORG, orgName: 'Org', role: 'VIEWER' }],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('reports page', () => {
  it('shows plays per content with totals, deleted content and CSV links', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-16T09:00:00Z') });
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session }),
      [`GET /api/v1/orgs/${ORG}/screens`]: () => ({ status: 200, body: { screens: [] } }),
    });
    // The report URL carries the query; answer any of them.
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/reports/plays?')) {
        calls.push({ key: `GET ${url}`, body: undefined });
        return new Response(
          JSON.stringify({
            report: {
              from: '2026-10-10',
              to: '2026-10-16',
              timeZone: 'UTC',
              totals: { plays: 1250, durationMs: 3_725_000 },
              items: [
                {
                  kind: 'media',
                  contentId: 'm1',
                  name: 'יום פתוח',
                  plays: 1000,
                  durationMs: 3_600_000,
                  screens: 3,
                },
                {
                  kind: 'widget',
                  contentId: null,
                  name: 'מבצע ישן',
                  plays: 250,
                  durationMs: 125_000,
                  screens: 1,
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return original(input, init);
    });

    renderRoutes(
      [{ path: '/orgs/:orgId/reports', element: <ReportsPage /> }],
      `/orgs/${ORG}/reports`,
    );
    const region = await screen.findByRole('region', { name: /10 באוק׳ 2026 – 16 באוק׳ 2026/ });
    expect(within(region).getByText('1,250 הצגות · זמן כולל 1:02:05')).toBeVisible();
    const rows = within(region).getAllByRole('row');
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      'יום פתוחמדיה1,0001:00:003',
      'מבצע ישן(נמחק)Widget2502:051',
    ]);

    const query = calls.find((c) => c.key.includes('/reports/plays?'))!.key;
    expect(query).toContain('from=2026-10-10&to=2026-10-16');
    const summary = screen.getByRole('link', { name: 'ייצוא סיכום (CSV)' });
    expect(summary.getAttribute('href')).toContain('format=csv');
    expect(
      screen.getByRole('link', { name: 'ייצוא כל ההצגות (CSV)' }).getAttribute('href'),
    ).toContain('view=events');

    // Changing the range asks the server again.
    const user = userEvent.setup();
    const from = screen.getByLabelText('מתאריך');
    await user.clear(from);
    await user.type(from, '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'הצגת הדוח' }));
    expect(calls.some((c) => c.key.includes('from=2026-10-01'))).toBe(true);
  });
});
