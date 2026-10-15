import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Redis } from 'ioredis';
import type { Env } from './config/env.js';
import type { HealthCheck } from './lib/health-checks.js';
import { HttpError } from './lib/http-error.js';
import { registerErrorHandling } from './plugins/errors.js';
import { healthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  env: Env;
  checks?: readonly HealthCheck[];
  /** When provided, rate-limit counters are shared across instances via Redis. */
  redis?: Redis;
  /** Override logging (tests pass `false`). */
  logger?: boolean;
}

/** Paths and keys that must never be written to logs. */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.secret',
];

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { env } = options;

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
          },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.BODY_LIMIT_BYTES,
    // Always generate our own request ids; never trust a client-supplied one.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    routerOptions: { ignoreTrailingSlash: true },
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(helmet, {
    // The API only serves JSON: deny everything a browser could do with it.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    // HSTS is set by the TLS-terminating reverse proxy (see deploy/Caddyfile).
    hsts: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    ...(options.redis ? { redis: options.redis, nameSpace: 'rubinny:rl:' } : {}),
    // Global limit fails open if Redis is unavailable; sensitive endpoints
    // (auth, pairing) will add their own fail-closed limits.
    skipOnError: true,
    errorResponseBuilder: () =>
      new HttpError(429, 'RATE_LIMITED', 'Too many requests, please try again later'),
  });

  registerErrorHandling(app);
  healthRoutes(app, { checks: options.checks ?? [] });

  return app;
}
