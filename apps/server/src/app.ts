// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import { ATTRIBUTION, POWERED_BY_HEADER } from '@rubinny/shared';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import type { Redis } from 'ioredis';
import type { Env } from './config/env.js';
import type { AppContext } from './context.js';
import type { HealthCheck } from './lib/health-checks.js';
import type { Mailer } from './lib/mail/mailer.js';
import { HttpError } from './lib/http-error.js';
import {
  afterCommit,
  registerTenantHooks,
  tenantAwareDb,
  tenantRoleAvailable,
} from './lib/tenant.js';
import { registerErrorHandling } from './plugins/errors.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/routes.js';
import { oidcRoutes } from './modules/auth/oidc.js';
import { assertOrgRouteGuarded, registerAuth } from './modules/auth/guards.js';
import { sessionCookieName } from './modules/auth/sessions.js';
import { rateLimitKey, type CredentialCheck } from './lib/rate-limit-key.js';
import { meRoutes } from './modules/me/routes.js';
import { orgRoutes } from './modules/orgs/routes.js';
import { mediaRoutes } from './modules/media/routes.js';
import websocket from '@fastify/websocket';
import { playerRoutes } from './modules/player/routes.js';
import { playerRoomRoutes } from './modules/rooms/player.js';
import { roomRoutes } from './modules/rooms/routes.js';
import { playlistRoutes } from './modules/playlists/routes.js';
import { screenGroupRoutes } from './modules/screens/groups.js';
import { screenRoutes } from './modules/screens/routes.js';
import { setupRoutes } from './modules/setup/routes.js';
import { layoutRoutes } from './modules/layouts/routes.js';
import { scheduleRoutes } from './modules/schedules/routes.js';
import { alertRoutes } from './modules/alerts/routes.js';
import { createAnthropicAi, type AiClientFactory } from './lib/ai.js';
import { aiRoutes } from './modules/ai/routes.js';
import { approvalRoutes } from './modules/approvals/routes.js';
import { startOfflineAlerts } from './modules/ops/alerts.js';
import { integrationApiRoutes } from './modules/integrations/api.js';
import { startWebhookDispatcher } from './modules/integrations/delivery.js';
import { apiKeyRoutes } from './modules/integrations/keys.js';
import { webhookRoutes } from './modules/integrations/webhooks.js';
import { opsRoutes } from './modules/ops/routes.js';
import { reportRoutes } from './modules/ops/reports.js';
import { screenshotRoutes } from './modules/ops/screenshots.js';
import { widgetRoutes } from './modules/widgets/routes.js';
import { kitRoutes } from './modules/kits/routes.js';
import { operatorRoutes, type OperatorProbes } from './modules/operator/routes.js';
import { clamavVersion } from './lib/clamav.js';
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
  /** Tests: replaces the server status probes (ClamAV versions, disk). */
  operator?: OperatorProbes;
  /** Tests: extra routes registered with the same context as the application's. */
  extraRoutes?: (app: FastifyInstance, ctx: AppContext) => void;
  /** Services for the /api routes. When omitted only health endpoints are served. */
  services?: Omit<AppContext, 'env' | 'mailer' | 'rls' | 'ai'> & {
    /** A mailer, or a factory receiving the app logger. */
    mailer: Mailer | ((log: FastifyBaseLogger) => Mailer);
    /** Defaults to the Anthropic API (official SDK). */
    ai?: AiClientFactory;
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
            serializers: {
              // The SSO callback carries a one-time authorization code: log the path only.
              req: (request) => ({
                method: request.method,
                url: request.url.startsWith('/api/v1/auth/oidc/')
                  ? (request.url.split('?')[0] ?? '')
                  : request.url,
                hostname: request.hostname,
                remoteAddress: request.ip,
                remotePort: request.socket.remotePort ?? 0,
              }),
            },
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
    // The attribution (LICENSING.md); no version, so it tells attackers nothing.
    reply.header('x-powered-by', POWERED_BY_HEADER);
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
  // Public: what this software is and where its source code is (no version, no settings).
  app.get('/api/v1/about', () => ({
    name: ATTRIBUTION.name,
    description: ATTRIBUTION.description,
    poweredBy: ATTRIBUTION.poweredBy,
    openSource: true,
    license: ATTRIBUTION.license,
    author: ATTRIBUTION.author,
    copyright: ATTRIBUTION.copyright,
    sourceUrl: ATTRIBUTION.sourceUrl,
  }));

  if (options.services) {
    const { mailer, ...services } = options.services;
    // Organization requests run in a row-level-security transaction (see lib/tenant.ts):
    // the database, screen events and worker jobs are wrapped to follow it.
    const rls = env.DATABASE_RLS && (await tenantRoleAvailable(services.db));
    if (env.DATABASE_RLS && !rls) {
      app.log.warn(
        'Row-level security is not active: the database role rubinny_tenant is missing (see docs/OPERATIONS.md)',
      );
    }
    registerTenantHooks(app);
    const events = services.events;
    const queue = services.media?.queue;
    const ctx: AppContext = {
      env,
      ...services,
      db: tenantAwareDb(services.db),
      rls,
      ai: services.ai ?? createAnthropicAi,
      events: {
        publish: (screenId, event) => afterCommit(() => events.publish(screenId, event)),
        onEvent: (handler) => {
          events.onEvent(handler);
        },
        close: () => events.close(),
      },
      ...(services.media && queue
        ? {
            media: {
              storage: services.media.storage,
              queue: {
                enqueue: (job) => afterCommit(() => queue.enqueue(job)),
                close: () => queue.close(),
              },
            },
          }
        : {}),
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
    oidcRoutes(app, ctx);
    meRoutes(app, ctx);
    orgRoutes(app, ctx);
    await app.register(websocket, { options: { maxPayload: 4096 } });
    playerRoutes(app, ctx);
    playerRoomRoutes(app, ctx);
    screenRoutes(app, ctx);
    screenGroupRoutes(app, ctx);
    roomRoutes(app, ctx);
    playlistRoutes(app, ctx);
    widgetRoutes(app, ctx);
    layoutRoutes(app, ctx);
    scheduleRoutes(app, ctx);
    alertRoutes(app, ctx);
    approvalRoutes(app, ctx);
    apiKeyRoutes(app, ctx);
    webhookRoutes(app, ctx);
    integrationApiRoutes(app, ctx);
    aiRoutes(app, ctx);
    opsRoutes(app, ctx);
    reportRoutes(app, ctx);
    screenshotRoutes(app, ctx);
    if (options.backgroundJobs) {
      startOfflineAlerts(app, ctx);
      startWebhookDispatcher(app, ctx);
    }
    kitRoutes(app, ctx);
    operatorRoutes(app, ctx, options.checks ?? [], {
      ...(ctx.media ? { clamav: () => clamavVersion(env.CLAMAV_HOST, env.CLAMAV_PORT) } : {}),
      ...options.operator,
    });
    if (ctx.media) {
      await app.register(multipart, {
        // Per-request limits are tightened in the upload handler.
        limits: { files: 1, fields: 0, parts: 1, headerPairs: 50 },
        throwFileSizeLimit: false,
      });
      mediaRoutes(app, ctx, ctx.media);
      stockRoutes(app, ctx);
    }
    options.extraRoutes?.(app, ctx);
  }

  return app;
}
