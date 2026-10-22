// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import pg from 'pg';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { postgresCheck, redisCheck } from '../src/lib/health-checks.js';

/**
 * Runs against real PostgreSQL and Redis/Valkey.
 * Enabled with RUBINNY_INTEGRATION=1 plus DATABASE_URL and REDIS_URL (CI sets these).
 */
const enabled = process.env.RUBINNY_INTEGRATION === '1';

describe.runIf(enabled)('integration: real dependencies', () => {
  let app: FastifyInstance;
  let pool: pg.Pool;
  let redis: Redis;

  beforeAll(async () => {
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      PUBLIC_URL: 'http://localhost:3000',
      ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      RATE_LIMIT_MAX: '3',
    });
    pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    await redis.flushdb();
    app = await buildApp({
      env,
      redis,
      logger: false,
      checks: [postgresCheck(pool), redisCheck(redis)],
    });
    app.get('/limited', () => ({ ok: true }));
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await redis.quit();
  });

  it('reports ready when PostgreSQL and Redis are reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { postgres: 'up', redis: 'up' } });
  });

  it('stores rate-limit counters in Redis', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await app.inject({ method: 'GET', url: '/limited' })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    const keys = await redis.keys('rubinny:rl:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});
