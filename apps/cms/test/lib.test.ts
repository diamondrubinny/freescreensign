import { describe, expect, it } from 'vitest';
import { i18n } from '../src/i18n';
import { ApiError } from '../src/api/client';
import { toFormErrors } from '../src/lib/api-errors';
import { safeNextPath } from '../src/lib/safe-redirect';
import { takeFragmentToken } from '../src/lib/fragment-token';
import { DEFAULT_A11Y, applyA11yPrefs, loadA11yPrefs, saveA11yPrefs } from '../src/lib/a11y-prefs';
import { he } from '../src/i18n/locales/he';
import { en } from '../src/i18n/locales/en';

const t = i18n.t.bind(i18n);

describe('toFormErrors', () => {
  it('maps field reasons to translated messages', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'x', [
      { path: 'password', reason: 'too_short' },
      { path: 'email', reason: 'invalid_format' },
      { path: 'name', reason: 'too_small' },
    ]);
    const result = toFormErrors(t, error);
    expect(result.form).toBeNull();
    expect(result.fields).toEqual({
      password: he.validation.too_short,
      email: he.validation.invalid_format,
      name: he.validation.required,
    });
  });

  it('maps error codes and network failures', () => {
    expect(toFormErrors(t, new ApiError(401, 'INVALID_CREDENTIALS', 'x')).form).toBe(
      he.errors.INVALID_CREDENTIALS,
    );
    expect(toFormErrors(t, new ApiError(0, 'NETWORK', 'x')).form).toBe(he.errors.network);
    expect(toFormErrors(t, new Error('boom')).form).toBe(he.errors.INTERNAL_ERROR);
    expect(toFormErrors(t, null)).toEqual({ form: null, fields: {} });
  });

  it('adds a support reference only for internal errors', () => {
    const result = toFormErrors(t, new ApiError(500, 'INTERNAL_ERROR', 'x', [], 'req-123'));
    expect(result.form).toContain('req-123');
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/orgs/1', '/orgs/1'],
    ['/account?x=1', '/account?x=1'],
    [null, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%j -> %j', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('takeFragmentToken', () => {
  it('reads the token and removes it from the URL', () => {
    window.history.replaceState(null, '', '/verify-email#token=abcdefghijklmnopqrstuvwxyz012345');
    expect(takeFragmentToken()).toBe('abcdefghijklmnopqrstuvwxyz012345');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/verify-email');
  });

  it('rejects malformed tokens', () => {
    window.history.replaceState(null, '', '/x#token=<script>');
    expect(takeFragmentToken()).toBeNull();
  });
});

describe('accessibility preferences', () => {
  it('round-trips, clamps and applies classes', () => {
    saveA11yPrefs({ ...DEFAULT_A11Y, fontScale: 500, contrast: true });
    const prefs = loadA11yPrefs();
    expect(prefs.fontScale).toBe(200);
    const root = document.createElement('html');
    applyA11yPrefs(prefs, root);
    expect(root.style.fontSize).toBe('200%');
    expect(root.classList.contains('a11y-contrast')).toBe(true);
    expect(root.classList.contains('a11y-underline-links')).toBe(false);
  });

  it('ignores corrupted storage', () => {
    window.localStorage.setItem('rubinny.a11y', '{not json');
    expect(loadA11yPrefs()).toEqual(DEFAULT_A11Y);
  });
});

describe('translations', () => {
  const keys = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it('English has exactly the same keys as Hebrew', () => {
    expect(keys(en).sort()).toEqual(keys(he).sort());
  });

  it('every API error code has a message', async () => {
    const { API_ERROR_CODES } = await import('@rubinny/shared');
    for (const code of API_ERROR_CODES) expect(he.errors).toHaveProperty(code);
  });
});
