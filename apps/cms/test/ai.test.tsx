import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrgSettingsPage } from '../src/pages/OrgSettingsPage';
import { WidgetEditorPage } from '../src/pages/WidgetEditorPage';
import { mockApi, renderRoutes } from './render';

const ORG = '11111111-1111-4111-8111-111111111111';
const WIDGET = '22222222-2222-4222-8222-222222222222';
const session = (role: string) => ({
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
    { orgId: ORG, name: 'School', role, requireAdminMfa: false, requireApproval: false },
  ],
});
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const off = { enabled: false, model: 'claude-opus-5-5', models: MODELS, keyHint: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI writing suggestions', () => {
  it('admins turn it on with a key, explicit consent and a model; and off again', async () => {
    let ai: Record<string, unknown> = off;
    let attempt = 0;
    const calls = mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('OWNER') }),
      [`GET /api/v1/orgs/${ORG}`]: () => ({
        status: 200,
        body: {
          org: {
            id: ORG,
            name: 'School',
            role: 'OWNER',
            requireAdminMfa: false,
            requireApproval: false,
            offlineAlerts: true,
            offlineAlertMinutes: 15,
          },
        },
      }),
      [`GET /api/v1/orgs/${ORG}/ai`]: () => ({ status: 200, body: { ai } }),
      [`PUT /api/v1/orgs/${ORG}/ai`]: () => {
        attempt++;
        if (attempt === 1) {
          return {
            status: 400,
            body: {
              error: {
                code: 'VALIDATION_FAILED',
                message: 'x',
                fields: [{ path: 'apiKey', reason: 'invalid' }],
              },
            },
          };
        }
        ai = { enabled: true, model: 'claude-haiku-5-5', models: MODELS, keyHint: 'WXYZ' };
        return { status: 200, body: { ai } };
      },
      [`DELETE /api/v1/orgs/${ORG}/ai`]: () => {
        ai = off;
        return { status: 204 };
      },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/settings', element: <OrgSettingsPage /> }],
      `/orgs/${ORG}/settings`,
    );
    const user = userEvent.setup();
    const section = await screen.findByRole(
      'region',
      { name: 'הצעות ניסוח (AI)' },
      { timeout: 5000 },
    );
    expect(within(section).getByText('כבוי')).toBeVisible();
    expect(within(section).getByText(/נשלח ל-Anthropic/)).toBeVisible();
    const key = within(section).getByLabelText(/מפתח API של Anthropic/);
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('autocomplete', 'off');
    const consent = within(section).getByRole('checkbox', { name: /אני מאשר\/ת/ });
    expect(consent).toBeRequired();

    await user.type(key, 'sk-ant-wrong-000000000000');
    await user.click(consent);
    await user.selectOptions(
      within(section).getByLabelText('מודל'),
      'Claude Haiku 5.5 (מהיר וזול)',
    );
    await user.click(within(section).getByRole('button', { name: 'שמירה' }));
    expect(
      await within(section).findByText('המפתח לא התקבל אצל הספק. בדקו אותו ונסו שוב.'),
    ).toBeVisible();
    expect(key).toHaveAttribute('aria-invalid', 'true');

    await user.clear(key);
    await user.type(key, 'sk-ant-good-0000000000WXYZ');
    await user.click(within(section).getByRole('button', { name: 'שמירה' }));
    expect(await within(section).findByText('פעיל · מפתח שמסתיים ב-WXYZ')).toBeVisible();
    expect(calls.filter((c) => c.key.startsWith('PUT')).at(-1)?.body).toEqual({
      apiKey: 'sk-ant-good-0000000000WXYZ',
      model: 'claude-haiku-5-5',
    });

    await user.click(within(section).getByRole('button', { name: 'כיבוי ומחיקת המפתח' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'כיבוי ומחיקת המפתח' }),
    );
    expect(await within(section).findByText('הצעות הניסוח כבויות והמפתח נמחק.')).toBeVisible();
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(true);
  });

  it('suggests wording in a text widget; the editor chooses to use it', async () => {
    let refuse = false;
    const widgetMocks = (enabled: boolean) => ({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/widget-types`]: () => ({
        status: 200,
        body: { types: [], weather: { enabled: false, attribution: '' } },
      }),
      [`GET /api/v1/orgs/${ORG}/widgets/${WIDGET}`]: () => ({
        status: 200,
        body: {
          widget: {
            id: WIDGET,
            type: 'text',
            name: 'הודעות',
            config: { text: 'אסיפת הורים מחר' },
            usage: 0,
            updatedAt: '2026-10-16T09:00:00Z',
          },
        },
      }),
      [`GET /api/v1/orgs/${ORG}/ai`]: () => ({
        status: 200,
        body: { ai: { ...off, enabled } },
      }),
    });
    const calls = mockApi({
      ...widgetMocks(true),
      [`POST /api/v1/orgs/${ORG}/ai/suggest`]: () =>
        refuse
          ? {
              status: 422,
              body: {
                error: {
                  code: 'UPSTREAM_FAILED',
                  message: 'x',
                  fields: [{ path: 'ai', reason: 'refused' }],
                },
              },
            }
          : { status: 200, body: { suggestion: 'מחר בערב: אסיפת הורים. נשמח לראותכם!' } },
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/widgets/:widgetId', element: <WidgetEditorPage /> }],
      `/orgs/${ORG}/widgets/${WIDGET}`,
    );
    const user = userEvent.setup();
    const suggest = await screen.findByRole('button', { name: 'הצעת ניסוח' }, { timeout: 5000 });
    expect(suggest).toHaveAccessibleDescription(/אל תכניסו מידע אישי/);
    await user.click(suggest);
    expect(await screen.findByText('מחר בערב: אסיפת הורים. נשמח לראותכם!')).toBeVisible();
    expect(calls.find((c) => c.key.startsWith('POST'))?.body).toEqual({
      task: 'text',
      prompt: 'אסיפת הורים מחר',
      locale: 'he',
    });
    // Nothing changes until the editor chooses the suggestion.
    const text = screen.getByRole('textbox', { name: /טקסט/ });
    expect(text).toHaveValue('אסיפת הורים מחר');
    await user.click(screen.getByRole('button', { name: 'שימוש בהצעה' }));
    expect(text).toHaveValue('מחר בערב: אסיפת הורים. נשמח לראותכם!');

    refuse = true;
    await user.click(screen.getByRole('button', { name: 'תרגום לאנגלית' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הספק סירב לבקשה הזו');
    expect(calls.filter((c) => c.key.startsWith('POST')).at(-1)?.body).toMatchObject({
      task: 'translate',
    });
  });

  it('shows no suggestion buttons while the organization has it off', async () => {
    mockApi({
      'GET /api/v1/auth/session': () => ({ status: 200, body: session('EDITOR') }),
      [`GET /api/v1/orgs/${ORG}/widget-types`]: () => ({
        status: 200,
        body: { types: [], weather: { enabled: false, attribution: '' } },
      }),
      [`GET /api/v1/orgs/${ORG}/widgets/${WIDGET}`]: () => ({
        status: 200,
        body: {
          widget: {
            id: WIDGET,
            type: 'text',
            name: 'הודעות',
            config: { text: 'x' },
            usage: 0,
            updatedAt: '2026-10-16T09:00:00Z',
          },
        },
      }),
      [`GET /api/v1/orgs/${ORG}/ai`]: () => ({ status: 200, body: { ai: off } }),
    });
    renderRoutes(
      [{ path: '/orgs/:orgId/widgets/:widgetId', element: <WidgetEditorPage /> }],
      `/orgs/${ORG}/widgets/${WIDGET}`,
    );
    await screen.findByRole('button', { name: 'שמירת ה-Widget' }, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: 'הצעת ניסוח' })).toBeNull();
  });
});
