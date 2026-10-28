// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiKeyItem, WebhookItem } from '../src/api/types';
import { IntegrationsPage } from '../src/pages/IntegrationsPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const TOKEN = `rbk_${'a'.repeat(43)}`;

const key: ApiKeyItem = {
  id: 'k1',
  name: 'מערכת כיבוי',
  prefix: 'rbk_abcdefgh',
  scopes: ['alerts:write'],
  createdAt: '2026-10-20T08:00:00Z',
  expiresAt: null,
  lastUsedAt: '2026-10-28T08:00:00Z',
  lastUsedIp: '203.0.113.0/24',
  revokedAt: null,
  active: true,
};
const hook: WebhookItem = {
  id: 'w1',
  name: 'Teams',
  url: 'https://hooks.example/teams',
  events: ['screen.offline'],
  enabled: false,
  disabledReason: 'failures',
  failureCount: 20,
  createdAt: '2026-10-20T08:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(handlers: Record<string, (body: unknown) => { status: number; body?: unknown }>) {
  const calls = mockApi({
    [`GET /api/v1/orgs/${ORG}/api-keys`]: () => ({ status: 200, body: { keys: [key] } }),
    [`GET /api/v1/orgs/${ORG}/webhooks`]: () => ({ status: 200, body: { webhooks: [hook] } }),
    ...handlers,
  });
  renderRoutes(
    [{ path: '/orgs/:orgId/integrations', element: <IntegrationsPage /> }],
    `/orgs/${ORG}/integrations`,
  );
  return calls;
}

describe('integrations page', () => {
  it('lists keys without their secret, and shows a new key once', async () => {
    const user = userEvent.setup();
    const calls = mount({
      [`POST /api/v1/orgs/${ORG}/api-keys`]: () => ({
        status: 201,
        body: { key: { ...key, id: 'k2', name: 'קופה' }, token: TOKEN },
      }),
    });
    await screen.findByText('מערכת כיבוי');
    const table = screen.getByRole('table');
    expect(within(table).getByText('מערכת כיבוי')).toBeVisible();
    expect(within(table).getByText('rbk_abcdefgh…')).toBeVisible();
    expect(within(table).getByText('הפעלה וסיום של התראות חירום')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'מפתח חדש' }));
    const dialog = await screen.findByRole('dialog', { name: 'מפתח חדש' });
    await user.type(within(dialog).getByLabelText(/^שם/), 'קופה');
    await user.click(within(dialog).getByLabelText('עדכון טקסט ב-Widgets של טקסט וטקסט רץ'));
    await user.selectOptions(within(dialog).getByLabelText('תוקף'), '90');
    await user.click(within(dialog).getByRole('button', { name: 'יצירה' }));
    // The key, once, with a warning.
    expect(await within(dialog).findByLabelText('מפתח')).toHaveValue(TOKEN);
    expect(within(dialog).getByText(/זו הפעם היחידה/)).toBeVisible();
    expect(calls.find((c) => c.key === `POST /api/v1/orgs/${ORG}/api-keys`)?.body).toEqual({
      name: 'קופה',
      scopes: ['widgets:write'],
      expiresInDays: 90,
    });
  });

  it('revokes a key after confirming', async () => {
    const user = userEvent.setup();
    const calls = mount({
      [`DELETE /api/v1/orgs/${ORG}/api-keys/k1`]: () => ({ status: 204 }),
    });
    await user.click(await screen.findByRole('button', { name: 'ביטול המפתח מערכת כיבוי' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/יפסיקו לעבוד מיד/)).toBeVisible();
    await user.click(within(confirm).getByRole('button', { name: 'ביטול המפתח' }));
    await waitFor(() => {
      expect(calls.some((c) => c.key === `DELETE /api/v1/orgs/${ORG}/api-keys/k1`)).toBe(true);
    });
  });

  it('shows a webhook turned off after failures, sends a test and says what came back', async () => {
    const user = userEvent.setup();
    mount({
      [`POST /api/v1/orgs/${ORG}/webhooks/w1/test`]: () => ({
        status: 200,
        body: { ok: false, status: 404, error: 'http_error' },
      }),
      [`GET /api/v1/orgs/${ORG}/webhooks/w1/deliveries`]: () => ({
        status: 200,
        body: {
          deliveries: [
            {
              id: 'd1',
              event: 'screen.offline',
              status: 'failed',
              attempts: 7,
              statusCode: 500,
              error: 'Upstream responded with 500',
              createdAt: '2026-10-28T08:00:00Z',
              deliveredAt: null,
              nextAttemptAt: null,
            },
          ],
        },
      }),
    });
    const card = (await screen.findByRole('heading', { name: 'Teams' })).closest('li')!;
    expect(within(card).getByText('כבוי אחרי כשלונות')).toBeVisible();
    expect(within(card).getByText(/מסך התנתק/)).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'שליחת בדיקה' }));
    expect(await within(card).findByText(/הבדיקה נכשלה \(404\)/)).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'משלוחים אחרונים' }));
    const deliveries = await within(card).findByRole('region', { name: 'משלוחים אחרונים: Teams' });
    expect(within(deliveries).getByText('נכשל')).toBeVisible();
    expect(within(deliveries).getByText('HTTP 500')).toBeVisible();
  });

  it('creates a webhook and shows its secret once; server errors appear by the field', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mount({
      [`POST /api/v1/orgs/${ORG}/webhooks`]: () => {
        attempt++;
        return attempt === 1
          ? {
              status: 400,
              body: {
                error: {
                  code: 'VALIDATION_FAILED',
                  message: 'Invalid',
                  fields: [{ path: 'url', reason: 'invalid' }],
                },
              },
            }
          : { status: 201, body: { webhook: hook, secret: 'whsec_secret' } };
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Webhook חדש' }));
    const dialog = await screen.findByRole('dialog', { name: 'Webhook חדש' });
    await user.type(within(dialog).getByLabelText(/^שם/), 'n8n');
    await user.type(within(dialog).getByLabelText(/^כתובת/), 'http://inside');
    await user.click(within(dialog).getByLabelText('התראת חירום הופעלה'));
    await user.click(within(dialog).getByRole('button', { name: 'יצירה' }));
    const url = within(dialog).getByLabelText(/^כתובת/);
    await waitFor(() => {
      expect(url).toHaveAttribute('aria-invalid', 'true');
    });
    await user.clear(url);
    await user.type(url, 'https://n8n.example/hook');
    await user.click(within(dialog).getByRole('button', { name: 'יצירה' }));
    expect(await within(dialog).findByLabelText('סוד החתימה')).toHaveValue('whsec_secret');
  });
});
