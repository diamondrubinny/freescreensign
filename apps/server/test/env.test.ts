import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from '../src/config/env.js';
import { baseEnv } from './helpers.js';

describe('loadEnv', () => {
  it('applies safe defaults', () => {
    const env = loadEnv(baseEnv);
    expect(env.PORT).toBe(3000);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.BODY_LIMIT_BYTES).toBe(1024 * 1024);
    expect(env.ALLOW_INSECURE_PUBLIC_URL).toBe(false);
  });

  it('reports missing keys without leaking values', () => {
    try {
      loadEnv({ ...baseEnv, DATABASE_URL: 'mysql://user:super-secret@db/x', REDIS_URL: undefined });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as ConfigError).message;
      expect(message).toContain('DATABASE_URL is invalid');
      expect(message).toContain('REDIS_URL is required');
      expect(message).not.toContain('super-secret');
    }
  });

  it('requires https in production unless explicitly overridden', () => {
    const prod = { ...baseEnv, NODE_ENV: 'production', SETUP_TOKEN: 'a'.repeat(32) };
    expect(() => loadEnv(prod)).toThrow(/https/);
    expect(loadEnv({ ...prod, ALLOW_INSECURE_PUBLIC_URL: 'true' }).NODE_ENV).toBe('production');
    expect(loadEnv({ ...prod, PUBLIC_URL: 'https://signage.example.com' }).PUBLIC_URL).toBe(
      'https://signage.example.com',
    );
  });

  it('enforces production safety rules for setup and mail', () => {
    const prod = { ...baseEnv, NODE_ENV: 'production', PUBLIC_URL: 'https://x.example.com' };
    expect(() => loadEnv(prod)).toThrow(/SETUP_TOKEN is required/);
    expect(() =>
      loadEnv({ ...prod, SETUP_TOKEN: 'a'.repeat(32), MAIL_TRANSPORT: 'console' }),
    ).toThrow(/MAIL_TRANSPORT/);
  });

  it('validates mail and registration combinations', () => {
    expect(() => loadEnv({ ...baseEnv, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
    expect(() => loadEnv({ ...baseEnv, REGISTRATION_MODE: 'open' })).toThrow(/MAIL_TRANSPORT/);
    expect(
      loadEnv({
        ...baseEnv,
        MAIL_TRANSPORT: 'smtp',
        SMTP_URL: 'smtps://user:pass@mail.example.com:465',
        MAIL_FROM: 'Rubinny <no-reply@example.com>',
        REGISTRATION_MODE: 'open',
      }).REGISTRATION_MODE,
    ).toBe('open');
  });

  it('treats empty values as unset', () => {
    const env = loadEnv({ ...baseEnv, SMTP_URL: '', MAIL_FROM: ' ', PORT: '' });
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it('rejects encryption keys of the wrong size', () => {
    expect(() =>
      loadEnv({ ...baseEnv, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('parses TRUST_PROXY', () => {
    expect(loadEnv({ ...baseEnv, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...baseEnv, TRUST_PROXY: 'uniquelocal, 127.0.0.1' }).TRUST_PROXY).toEqual([
      'uniquelocal',
      '127.0.0.1',
    ]);
    expect(() => loadEnv({ ...baseEnv, TRUST_PROXY: '2' })).toThrow(/hop counts/);
  });

  it('rejects out-of-range numbers and unknown enums', () => {
    expect(() => loadEnv({ ...baseEnv, PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadEnv({ ...baseEnv, LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
  });
});
