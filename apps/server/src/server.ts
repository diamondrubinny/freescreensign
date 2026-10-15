import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from './app.js';
import { ConfigError, loadEnv } from './config/env.js';
import { postgresCheck, redisCheck } from './lib/health-checks.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const env = loadEnv();

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    // Fail fast instead of queueing commands while Redis is unreachable.
    enableOfflineQueue: false,
  });

  const app = await buildApp({
    env,
    redis,
    checks: [postgresCheck(pool), redisCheck(redis)],
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
      await Promise.allSettled([pool.end(), redis.quit()]);
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

  await app.listen({ host: env.HOST, port: env.PORT });
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
