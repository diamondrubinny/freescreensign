import { loadEnv, type Env } from '../src/config/env.js';

export const baseEnv = {
  NODE_ENV: 'test',
  PUBLIC_URL: 'http://localhost:8080',
  DATABASE_URL: 'postgres://rubinny:secret-password@localhost:5432/rubinny',
  REDIS_URL: 'redis://localhost:6379',
  // Test-only key (32 zero bytes). Never use a predictable key outside tests.
  ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
};

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({ ...baseEnv, ...overrides });
}
