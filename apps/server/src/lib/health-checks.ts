// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

export interface HealthCheck {
  readonly name: string;
  check(): Promise<void>;
}

export type CheckStatus = 'up' | 'down';

export interface ReadinessReport {
  ready: boolean;
  checks: Record<string, CheckStatus>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Runs all checks in parallel. Failure details are returned separately for logging only. */
export async function runHealthChecks(
  checks: readonly HealthCheck[],
  timeoutMs: number,
): Promise<ReadinessReport & { failures: { name: string; error: unknown }[] }> {
  const results = await Promise.allSettled(
    checks.map((check) => withTimeout(check.check(), timeoutMs)),
  );
  const report: Record<string, CheckStatus> = {};
  const failures: { name: string; error: unknown }[] = [];
  results.forEach((result, index) => {
    const name = checks[index]?.name ?? `check-${index}`;
    report[name] = result.status === 'fulfilled' ? 'up' : 'down';
    if (result.status === 'rejected') failures.push({ name, error: result.reason });
  });
  return { ready: failures.length === 0, checks: report, failures };
}

export function postgresCheck(pool: Pool): HealthCheck {
  return {
    name: 'postgres',
    async check() {
      await pool.query('SELECT 1');
    },
  };
}

export function redisCheck(redis: Redis): HealthCheck {
  return {
    name: 'redis',
    async check() {
      await redis.ping();
    },
  };
}
