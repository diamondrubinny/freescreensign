// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { runHealthChecks, type HealthCheck } from '../lib/health-checks.js';

export interface HealthRoutesOptions {
  checks: readonly HealthCheck[];
  timeoutMs?: number;
}

/**
 * GET /health        — liveness: the process is up (no dependency checks).
 * GET /health/ready  — readiness: dependencies are reachable. Intended for the
 *                      internal network only; the reverse proxy does not expose it.
 */
export function healthRoutes(app: FastifyInstance, options: HealthRoutesOptions) {
  const timeoutMs = options.timeoutMs ?? 2000;

  app.get('/health', { config: { rateLimit: false } }, () => ({ status: 'ok' }));

  app.get('/health/ready', { config: { rateLimit: false } }, async (request, reply) => {
    const { ready, checks, failures } = await runHealthChecks(options.checks, timeoutMs);
    for (const failure of failures) {
      request.log.warn({ check: failure.name, err: failure.error }, 'readiness check failed');
    }
    return reply
      .status(ready ? 200 : 503)
      .send({ status: ready ? 'ready' : 'unavailable', checks });
  });
}
