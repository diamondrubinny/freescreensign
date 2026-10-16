import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/pages/LoginPage';
import { mockApi, renderRoutes } from './render';

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
  memberships: [],
};

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/orgs/x', element: <p>orgs page</p> },
  { path: '/', element: <p>home page</p> },
  { path: '/setup', element: <p>setup page</p> },
];

const base = {
  'GET /api/v1/auth/session': () => ({
    status: 401,
    body: { error: { code: 'UNAUTHORIZED', message: 'x' } },
  }),
  'GET /api/v1/setup/status': () => ({
    status: 200,
    body: { needsSetup: false, setupTokenRequired: true },
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('redirects to setup on a fresh installation', async () => {
    mockApi({
      ...base,
      'GET /api/v1/setup/status': () => ({
        status: 200,
        body: { needsSetup: true, setupTokenRequired: true },
      }),
    });
    renderRoutes(routes, '/login');
    expect(await screen.findByText('setup page')).toBeInTheDocument();
  });

  it('shows a translated error for wrong credentials and focuses it', async () => {
    mockApi({
      ...base,
      'POST /api/v1/auth/login': () => ({
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'x' } },
      }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, '/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'התחברות' })).toHaveFocus();
    await user.type(screen.getByLabelText(/אימייל/), 'dana@example.com');
    await user.type(screen.getByLabelText(/סיסמה/), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('האימייל או הסיסמה שגויים.');
  });

  it('marks invalid fields from server validation', async () => {
    mockApi({
      ...base,
      'POST /api/v1/auth/login': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            fields: [{ path: 'email', reason: 'invalid_format' }],
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, '/login');
    await user.type(await screen.findByLabelText(/אימייל/), 'nope');
    await user.type(screen.getByLabelText(/סיסמה/), 'x');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));
    await waitFor(() => {
      expect(screen.getByLabelText(/אימייל/)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByLabelText(/אימייל/)).toHaveFocus();
  });

  it('completes the MFA step and follows a safe ?next redirect', async () => {
    const calls = mockApi({
      ...base,
      'POST /api/v1/auth/login': () => ({
        status: 200,
        body: { mfaRequired: true, mfaToken: 'challenge-token-0123456789' },
      }),
      'POST /api/v1/auth/mfa/verify': () => ({
        status: 200,
        body: { mfaRequired: false, ...session },
      }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, '/login?next=%2Forgs%2Fx');
    await user.type(await screen.findByLabelText(/אימייל/), 'dana@example.com');
    await user.type(screen.getByLabelText(/סיסמה/), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'אימות דו-שלבי' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/קוד אימות/), '123456');
    await user.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByText('orgs page')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/mfa/verify')?.body).toEqual({
      mfaToken: 'challenge-token-0123456789',
      code: '123456',
    });
  });

  it('ignores an unsafe ?next redirect', async () => {
    mockApi({
      ...base,
      'POST /api/v1/auth/login': () => ({ status: 200, body: { mfaRequired: false, ...session } }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, '/login?next=%2F%2Fevil.example');
    await user.type(await screen.findByLabelText(/אימייל/), 'dana@example.com');
    await user.type(screen.getByLabelText(/סיסמה/), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});

describe('LoginPage MFA errors', () => {
  it('explains that the code (not the password) was wrong', async () => {
    mockApi({
      ...base,
      'POST /api/v1/auth/login': () => ({
        status: 200,
        body: { mfaRequired: true, mfaToken: 'challenge-token-0123456789' },
      }),
      'POST /api/v1/auth/mfa/verify': () => ({
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'x' } },
      }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, '/login');
    await user.type(await screen.findByLabelText(/אימייל/), 'dana@example.com');
    await user.type(screen.getByLabelText(/סיסמה/), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'התחברות' }));
    await user.type(await screen.findByLabelText(/קוד אימות/), '000000');
    await user.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('קוד האימות שגוי');
  });

  it('offers the organization sign-in and explains SSO errors', async () => {
    mockApi({
      ...base,
      'GET /api/v1/auth/providers': () => ({ status: 200, body: { oidc: { name: 'Google' } } }),
    });
    renderRoutes(routes, '/login?sso=not_invited&next=/orgs/x');
    const link = await screen.findByRole('link', { name: 'התחברות עם Google' });
    expect(link).toHaveAttribute('href', '/api/v1/auth/oidc/start?returnTo=%2Forgs%2Fx');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'אין לחשבון הזה גישה עדיין. בקשו ממנהל הארגון הזמנה לכתובת האימייל שלכם.',
    );
  });

  it('shows no organization sign-in when the server has none, and hides unknown codes', async () => {
    mockApi({
      ...base,
      'GET /api/v1/auth/providers': () => ({ status: 200, body: { oidc: null } }),
    });
    renderRoutes(routes, '/login?sso=<script>');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ההתחברות דרך הארגון נכשלה. נסו שוב.',
    );
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /התחברות עם/ })).toBeNull();
    });
  });

  it('continues with the second factor after an SSO sign-in (token in the fragment)', async () => {
    const token = 'A'.repeat(43);
    const calls = mockApi({
      ...base,
      'GET /api/v1/auth/providers': () => ({ status: 200, body: { oidc: { name: 'Google' } } }),
      'POST /api/v1/auth/mfa/verify': () => ({
        status: 200,
        body: { mfaRequired: false, ...session },
      }),
    });
    window.history.replaceState(null, '', `/login#mfa=${token}&returnTo=%2Forgs%2Fx`);
    renderRoutes(routes, '/login');
    const code = await screen.findByLabelText(/קוד/);
    // The token is not left in the address bar.
    expect(window.location.hash).toBe('');
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'אימות' }));
    expect(await screen.findByText('orgs page')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /api/v1/auth/mfa/verify')?.body).toEqual({
      mfaToken: token,
      code: '123456',
    });
  });
});
