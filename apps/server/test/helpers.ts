import { loadEnv, type Env } from '../src/config/env.js';

export const baseEnv = {
  NODE_ENV: 'test',
  PUBLIC_URL: 'http://localhost:8080',
  DATABASE_URL: 'postgres://rubinny:secret-password@localhost:5432/rubinny',
  REDIS_URL: 'redis://localhost:6379',
};

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({ ...baseEnv, ...overrides });
}
