import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { Redis } from 'ioredis';
import type { Env } from './config/env.js';
import type { AppContext } from './context.js';
import type { HealthCheck } from './lib/health-checks.js';
import type { Mailer } from './lib/mail/mailer.js';
import { HttpError } from './lib/http-error.js';
import { registerErrorHandling } from './plugins/errors.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/routes.js';
import { assertOrgRouteGuarded, registerAuth } from './modules/auth/guards.js';
import { sessionCookieName } from './modules/auth/sessions.js';
import { rateLimitKey, type CredentialCheck } from './lib/rate-limit-key.js';
import { meRoutes } from './modules/me/routes.js';
import { orgRoutes } from './modules/orgs/routes.js';
import { mediaRoutes } from './modules/media/routes.js';
import websocket from '@fastify/websocket';
import { playerRoutes } from './modules/player/routes.js';
import { playlistRoutes } from './modules/playlists/routes.js';
import { screenRoutes } from './modules/screens/routes.js';
import { setupRoutes } from './modules/setup/routes.js';
import { layoutRoutes } from './modules/layouts/routes.js';
import { scheduleRoutes } from './modules/schedules/routes.js';
import { startOfflineAlerts } from './modules/ops/alerts.js';
import { opsRoutes } from './modules/ops/routes.js';
import { reportRoutes } from './modules/ops/reports.js';
import { screenshotRoutes } from './modules/ops/screenshots.js';
import { widgetRoutes } from './modules/widgets/routes.js';
import { kitRoutes } from './modules/kits/routes.js';
import { stockRoutes } from './modules/stock/routes.js';

export interface BuildAppOptions {
  env: Env;
  checks?: readonly HealthCheck[];
  /** When provided, rate-limit counters are shared across instances via Redis. */
  redis?: Redis;
  /** Override logging (tests pass `false`). */
  logger?: boolean;
  /** Runs timers such as offline alerts (the server process; tests call jobs directly). */
  backgroundJobs?: boolean;
  /** Called for every route as it is registered (tests and diagnostics). */
  onRoute?: (route: { method: string; url: string }) => void;
  /** Services for the /api routes. When omitted only health endpoints are served. */
  services?: Omit<AppContext, 'env' | 'mailer'> & {
    /** A mailer, or a factory receiving the app logger. */
    mailer: Mailer | ((log: FastifyBaseLogger) => Mailer);
  };
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

  const db = options.services?.db;
  const credentialCheck: CredentialCheck | undefined = db
    ? async (kind, hash) => {
        const row =
          kind === 'device'
            ? await db
                .selectFrom('screens')
                .select('id')
                .where('token_hash', '=', hash)
                .executeTakeFirst()
            : await db
                .selectFrom('sessions')
                .select('id_hash')
                .where('id_hash', '=', hash)
                .where('expires_at', '>', new Date())
                .executeTakeFirst();
        return row !== undefined;
      }
    : undefined;

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    ...(options.redis ? { redis: options.redis, nameSpace: 'rubinny:rl:' } : {}),
    // Global limit fails open if Redis is unavailable; sensitive endpoints
    // (auth, pairing) will add their own fail-closed limits.
    skipOnError: true,
    // request.ip can be missing (e.g. Unix sockets, injected upgrades); never crash on it.
    // Per verified screen or session, otherwise per IP (see rate-limit-key.ts).
    keyGenerator: (request) => rateLimitKey(request, sessionCookieName(env), credentialCheck),
    errorResponseBuilder: () =>
      new HttpError(429, 'RATE_LIMITED', 'Too many requests, please try again later'),
  });

  await app.register(cookie);

  registerErrorHandling(app);
  healthRoutes(app, { checks: options.checks ?? [] });

  if (options.services) {
    const { mailer, ...services } = options.services;
    const ctx: AppContext = {
      env,
      ...services,
      mailer: typeof mailer === 'function' ? mailer(app.log) : mailer,
    };
    // Before any route: an organization route without orgGuard stops the server from starting.
    app.addHook('onRoute', assertOrgRouteGuarded);
    const { onRoute } = options;
    if (onRoute) {
      app.addHook('onRoute', (route) => {
        for (const method of [route.method].flat()) onRoute({ method, url: route.url });
      });
    }
    registerAuth(app, ctx);
    setupRoutes(app, ctx);
    authRoutes(app, ctx);
    meRoutes(app, ctx);
    orgRoutes(app, ctx);
    await app.register(websocket, { options: { maxPayload: 4096 } });
    playerRoutes(app, ctx);
    screenRoutes(app, ctx);
    playlistRoutes(app, ctx);
    widgetRoutes(app, ctx);
    layoutRoutes(app, ctx);
    scheduleRoutes(app, ctx);
    opsRoutes(app, ctx);
    reportRoutes(app, ctx);
    screenshotRoutes(app, ctx);
    if (options.backgroundJobs) startOfflineAlerts(app, ctx);
    kitRoutes(app, ctx);
    if (ctx.media) {
      await app.register(multipart, {
        // Per-request limits are tightened in the upload handler.
        limits: { files: 1, fields: 0, parts: 1, headerPairs: 50 },
        throwFileSizeLimit: false,
      });
      mediaRoutes(app, ctx, ctx.media);
      stockRoutes(app, ctx);
    }
  }

  return app;
}
