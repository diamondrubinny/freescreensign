import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { HealthCheck } from '../src/lib/health-checks.js';
import { HttpError } from '../src/lib/http-error.js';
import { testEnv } from './helpers.js';

const up = (name: string): HealthCheck => ({ name, check: () => Promise.resolve() });
const down = (name: string): HealthCheck => ({
  name,
  check: () => Promise.reject(new Error('connection refused to 10.0.0.5')),
});
const hang = (name: string): HealthCheck => ({ name, check: () => new Promise(() => undefined) });

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make(options: { checks?: HealthCheck[]; env?: Record<string, string> } = {}) {
  app = await buildApp({ env: testEnv(options.env), checks: options.checks ?? [], logger: false });
  return app;
}

describe('health endpoints', () => {
  it('GET /health reports liveness', async () => {
    const res = await (await make()).inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready is 200 when all dependencies are up', async () => {
    const res = await (
      await make({ checks: [up('postgres'), up('redis')] })
    ).inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { postgres: 'up', redis: 'up' } });
  });

  it('GET /health/ready is 503 and hides failure details when a dependency is down', async () => {
    const res = await (
      await make({ checks: [up('postgres'), down('redis')] })
    ).inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { postgres: 'up', redis: 'down' },
    });
    expect(res.body).not.toContain('10.0.0.5');
  });

  it('GET /health/ready times out hanging checks', async () => {
    const instance = await make({ checks: [hang('postgres')] });
    const started = Date.now();
    const res = await instance.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 10_000);
});

describe('security headers', () => {
  it('sets a restrictive CSP and standard hardening headers', async () => {
    const res = await (await make()).inject({ method: 'GET', url: '/health' });
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('generates request ids and ignores client-supplied ones', async () => {
    const res = await (
      await make()
    ).inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'attacker-controlled' },
    });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error handling', () => {
  it('returns a structured 404', async () => {
    const res = await (await make()).inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('hides internal error details', async () => {
    const instance = await make();
    instance.get('/boom', () => {
      throw new Error('db password is hunter2');
    });
    const res = await instance.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(res.body).not.toContain('hunter2');
  });

  it('passes through safe HttpErrors', async () => {
    const instance = await make();
    instance.get('/forbidden', () => {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this screen');
    });
    const res = await instance.inject({ method: 'GET', url: '/forbidden' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this screen' },
    });
  });

  it('maps schema validation failures to VALIDATION_FAILED', async () => {
    const instance = await make();
    instance.post(
      '/echo',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string' } },
          },
        },
      },
      (request) => request.body,
    );
    const res = await instance.inject({ method: 'POST', url: '/echo', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('rejects oversized bodies with 413', async () => {
    const instance = await make({ env: { BODY_LIMIT_BYTES: '1024' } });
    instance.post('/echo', (request) => request.body);
    const res = await instance.inject({
      method: 'POST',
      url: '/echo',
      payload: { data: 'x'.repeat(2048) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('rejects malformed JSON without leaking parser details', async () => {
    const instance = await make();
    instance.post('/echo', (request) => request.body);
    const res = await instance.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"broken":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'BAD_REQUEST', message: 'The request could not be processed' },
    });
  });
});

describe('rate limiting', () => {
  it('returns 429 with the standard error shape once the limit is exceeded', async () => {
    const instance = await make({ env: { RATE_LIMIT_MAX: '2' } });
    instance.get('/limited', () => ({ ok: true }));
    const statuses: number[] = [];
    let last;
    for (let i = 0; i < 3; i++) {
      last = await instance.inject({ method: 'GET', url: '/limited' });
      statuses.push(last.statusCode);
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect(last?.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(last?.headers['retry-after']).toBeDefined();
  });

  it('rate-limits 404 responses', async () => {
    const instance = await make({ env: { RATE_LIMIT_MAX: '1' } });
    await instance.inject({ method: 'GET', url: '/a' });
    const res = await instance.inject({ method: 'GET', url: '/b' });
    expect(res.statusCode).toBe(429);
  });

  it('does not rate-limit liveness checks', async () => {
    const instance = await make({ env: { RATE_LIMIT_MAX: '1' } });
    for (let i = 0; i < 5; i++) {
      const res = await instance.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }
  });
});
