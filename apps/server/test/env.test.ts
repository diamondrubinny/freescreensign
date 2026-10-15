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
    expect(() => loadEnv({ ...baseEnv, NODE_ENV: 'production' })).toThrow(/https/);
    expect(
      loadEnv({ ...baseEnv, NODE_ENV: 'production', ALLOW_INSECURE_PUBLIC_URL: 'true' }).NODE_ENV,
    ).toBe('production');
    expect(
      loadEnv({ ...baseEnv, NODE_ENV: 'production', PUBLIC_URL: 'https://signage.example.com' })
        .PUBLIC_URL,
    ).toBe('https://signage.example.com');
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
