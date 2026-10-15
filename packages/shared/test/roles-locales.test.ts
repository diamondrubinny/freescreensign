import { describe, expect, it } from 'vitest';
import { hasRole } from '../src/roles.js';
import { isSupportedLocale, textDirection } from '../src/locales.js';

describe('hasRole', () => {
  it('respects the role hierarchy', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('EDITOR', 'ADMIN')).toBe(false);
    expect(hasRole('VIEWER', 'EDITOR')).toBe(false);
    expect(hasRole('VIEWER', 'VIEWER')).toBe(true);
  });
});

describe('locales', () => {
  it('detects text direction', () => {
    expect(textDirection('he')).toBe('rtl');
    expect(textDirection('he-IL')).toBe('rtl');
    expect(textDirection('ar_EG')).toBe('rtl');
    expect(textDirection('en-US')).toBe('ltr');
  });

  it('validates supported locales', () => {
    expect(isSupportedLocale('he')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
  });
});
