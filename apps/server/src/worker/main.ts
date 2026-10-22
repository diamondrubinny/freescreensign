// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import pg from 'pg';
import { pino } from 'pino';
import { ATTRIBUTION_BANNER } from '@rubinny/shared';
import { ConfigError, loadEnv } from '../config/env.js';
import { createDb, migrateToLatest } from '../db/database.js';
import { Storage, storageConfigFromEnv } from '../lib/storage.js';
import { startHeartbeat } from './heartbeat.js';
import { startMediaWorker } from './worker.js';

/** Media worker process: scans and processes uploads from the queue. */
async function main() {
  const env = loadEnv();
  const log = pino({ level: env.LOG_LEVEL, base: { service: 'worker' } });
  const storageConfig = storageConfigFromEnv(env);
  if (!storageConfig) throw new ConfigError(['S3_ENDPOINT is required for the media worker']);

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: env.WORKER_CONCURRENCY + 2 });
  pool.on('error', (err) => {
    log.error({ err }, 'postgres pool error');
  });
  const db = createDb(pool);
  if (env.MIGRATE_ON_START) await migrateToLatest(db);
  const storage = new Storage(storageConfig);
  await storage.ensureBuckets();

  const worker = startMediaWorker(
    { db, storage, clamav: { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT }, log },
    { redisUrl: env.REDIS_URL, concurrency: env.WORKER_CONCURRENCY },
  );
  const stopHeartbeat = await startHeartbeat(() => worker.isRunning(), {
    onError: (err) => {
      log.warn({ err }, 'worker heartbeat write failed');
    },
  });
  log.info({ concurrency: env.WORKER_CONCURRENCY }, 'media worker started');
  log.info(ATTRIBUTION_BANNER);

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker shutting down');
    const timer = setTimeout(() => process.exit(1), 30_000);
    timer.unref();
    await stopHeartbeat();
    await worker.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  process.stderr.write(
    `${err instanceof ConfigError ? err.message : `Fatal worker error: ${err instanceof Error ? err.message : 'unknown'}`}\n`,
  );
  process.exit(1);
});
