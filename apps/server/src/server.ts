import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { ConfigError, loadEnv } from './config/env.js';
import { createDb, migrateToLatest } from './db/database.js';
import { KeyRing } from './lib/crypto.js';
import { postgresCheck, redisCheck } from './lib/health-checks.js';
import { RedisLimiter } from './lib/limiter.js';
import { RedisKvCache } from './lib/kv-cache.js';
import { createMailer } from './lib/mail/mailer.js';
import { cleanupStaleUploads, runMaintenance } from './lib/maintenance.js';
import { Storage, storageConfigFromEnv } from './lib/storage.js';
import { pingClamav } from './lib/clamav.js';
import { createMediaQueue } from './queue.js';
import { RedisScreenEvents } from './lib/screen-events.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

async function main() {
  const env = loadEnv();

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    // Fail fast instead of queueing commands while Redis is unreachable.
    enableOfflineQueue: false,
  });

  const db = createDb(pool);
  const keys = new KeyRing(env.ENCRYPTION_KEY);
  // Pub/sub needs its own connection; it may queue commands until connected.
  const subscriber = redis.duplicate({ enableOfflineQueue: true });
  const events = new RedisScreenEvents(redis, subscriber);
  await events.start();
  const storageConfig = storageConfigFromEnv(env);
  const media = storageConfig
    ? { storage: new Storage(storageConfig), queue: createMediaQueue(env.REDIS_URL) }
    : undefined;

  const app = await buildApp({
    env,
    redis,
    checks: [
      postgresCheck(pool),
      redisCheck(redis),
      ...(media
        ? [{ name: 'clamav', check: () => pingClamav(env.CLAMAV_HOST, env.CLAMAV_PORT) }]
        : []),
    ],
    services: {
      events,
      ...(media ? { media } : {}),
      db,
      keys,
      limiter: new RedisLimiter(redis),
      cache: new RedisKvCache(redis),
      mailer: (log) => createMailer(env, log),
    },
  });

  pool.on('error', (err) => {
    app.log.error({ err }, 'postgres pool error');
  });
  redis.on('error', (err) => {
    app.log.warn({ err }, 'redis connection error');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      app.log.error('forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    try {
      await app.close();
      await events.close();
      await Promise.allSettled([pool.end(), redis.quit(), subscriber.quit()]);
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: reason }, 'unhandled promise rejection');
    void shutdown('unhandledRejection');
  });

  if (media) {
    await media.storage.ensureBuckets();
    app.addHook('onClose', () => media.queue.close());
  }

  if (env.MIGRATE_ON_START) {
    const applied = await migrateToLatest(db);
    if (applied.length > 0) app.log.info({ migrations: applied }, 'database migrations applied');
  }

  const maintenance = async () => {
    try {
      const result = await runMaintenance(db, env.AUDIT_RETENTION_DAYS);
      if (media) await cleanupStaleUploads(db, media.queue);
      app.log.info({ removed: result }, 'maintenance completed');
    } catch (err) {
      app.log.error({ err }, 'maintenance failed');
    }
  };
  const maintenanceTimer = setInterval(() => void maintenance(), MAINTENANCE_INTERVAL_MS);
  maintenanceTimer.unref();
  app.addHook('onClose', () => {
    clearInterval(maintenanceTimer);
  });

  await app.listen({ host: env.HOST, port: env.PORT });
  void maintenance();
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    process.stderr.write(`${err.message}\n`);
  } else {
    process.stderr.write(
      `Fatal startup error: ${err instanceof Error ? err.message : 'unknown'}\n`,
    );
  }
  process.exit(1);
});
