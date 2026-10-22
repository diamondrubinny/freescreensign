import { statfs } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { AppContext } from '../../context.js';
import type { ClamavVersion } from '../../lib/clamav.js';
import { runHealthChecks, type HealthCheck } from '../../lib/health-checks.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { SERVER_VERSION } from '../../lib/version.js';
import { requireAuth } from '../auth/guards.js';
import { ONLINE_WINDOW_MS } from '../screens/routes.js';

/**
 * The server status page for the operator of the installation (docs/phases/13-next-plan.md):
 * services, antivirus signatures, the last backup, disk, media processing and usage counts.
 * Read only; numbers, no names or addresses. Anyone but an operator with two-step
 * verification gets 404, so the page does not reveal that it exists.
 */

export const STATUS_LIMITS = {
  /** clamd's signature database older than this is a warning. */
  signaturesMaxAgeMs: 3 * 24 * 3600_000,
  /** No backup for longer than this is an error (a daily backup plus slack). */
  backupMaxAgeMs: 26 * 3600_000,
  /** Less free disk than this share is a warning, under half of it an error. */
  diskMinFree: 0.2,
  /** A file waiting longer than this for scanning or processing is a warning. */
  processingMaxWaitMs: 15 * 60_000,
} as const;

export type State = 'ok' | 'warning' | 'error' | 'unknown';

export interface OperatorProbes {
  /** clamd's versions; absent when media (and so ClamAV) is not configured. */
  clamav?: () => Promise<ClamavVersion>;
  /** Free and total bytes of the server's disk. */
  disk?: () => Promise<{ freeBytes: number; totalBytes: number }>;
}

const rootDisk = async () => {
  const stats = await statfs('/');
  return { freeBytes: stats.bavail * stats.bsize, totalBytes: stats.blocks * stats.bsize };
};

const ageState = (at: Date | null, maxAgeMs: number, now: number): State =>
  at === null ? 'error' : now - at.getTime() > maxAgeMs ? 'warning' : 'ok';

export function operatorRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  checks: readonly HealthCheck[],
  probes: OperatorProbes = {},
) {
  const disk = probes.disk ?? rootDisk;

  app.get('/api/v1/operator/status', async (request) => {
    const { user } = requireAuth(request);
    if (!user.is_operator || user.mfa_enabled_at === null) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    }
    await ctx.limiter.hit(LIMITS.operatorStatusUser, user.id);
    const now = Date.now();

    const [health, clamav, diskInfo, migration, backup, sizes, processing, usage] =
      await Promise.all([
        runHealthChecks(checks, 2000),
        probes.clamav ? probes.clamav().catch(() => null) : Promise.resolve(undefined),
        disk().catch(() => null),
        sql<{ name: string }>`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`
          .execute(ctx.db)
          .then((result) => result.rows[0]),
        ctx.db
          .selectFrom('backup_runs')
          .select(['finished_at', 'size_bytes', 'encrypted'])
          .orderBy('finished_at', 'desc')
          .executeTakeFirst(),
        sql<{ database: string; media: string | null }>`
          SELECT pg_database_size(current_database())::text AS database,
            (SELECT sum(size_bytes)::text FROM media WHERE deleted_at IS NULL) AS media
        `.execute(ctx.db),
        ctx.db
          .selectFrom('media')
          .select((eb) => [
            eb.fn.countAll<string>().as('waiting'),
            eb.fn.min('created_at').as('oldest'),
          ])
          .where('status', 'in', ['queued', 'processing'])
          .where('deleted_at', 'is', null)
          .executeTakeFirstOrThrow(),
        sql<{ organizations: string; users: string; screens: string; online: string }>`
          SELECT
            (SELECT count(*) FROM organizations WHERE deleted_at IS NULL)::text AS organizations,
            (SELECT count(*) FROM users WHERE deleted_at IS NULL)::text AS users,
            (SELECT count(*) FROM screens)::text AS screens,
            (SELECT count(*) FROM screens
              WHERE last_seen_at > now() - make_interval(secs => ${ONLINE_WINDOW_MS / 1000}))::text
              AS online
        `.execute(ctx.db),
      ]);
    for (const failure of health.failures) {
      request.log.warn({ check: failure.name, err: failure.error }, 'status check failed');
    }

    const freeShare = diskInfo ? diskInfo.freeBytes / Math.max(diskInfo.totalBytes, 1) : null;
    // min() of no rows is null, although the column itself is not.
    const oldestRaw = processing.oldest as Date | null;
    const oldest = oldestRaw === null ? null : new Date(oldestRaw);
    const size = sizes.rows[0];
    const counts = usage.rows[0];
    return {
      status: {
        checkedAt: new Date(now).toISOString(),
        version: { server: SERVER_VERSION, migration: migration?.name ?? null },
        services: {
          state: health.ready ? 'ok' : 'error',
          checks: health.checks,
        },
        clamav:
          clamav === undefined
            ? { state: 'unknown' as State, configured: false }
            : clamav === null
              ? { state: 'error' as State, configured: true }
              : {
                  state: ageState(clamav.signaturesDate, STATUS_LIMITS.signaturesMaxAgeMs, now),
                  configured: true,
                  engine: clamav.engine,
                  signatures: clamav.signatures,
                  signaturesDate: clamav.signaturesDate?.toISOString() ?? null,
                },
        backup: backup
          ? {
              state:
                now - backup.finished_at.getTime() > STATUS_LIMITS.backupMaxAgeMs
                  ? ('error' as State)
                  : backup.encrypted
                    ? ('ok' as State)
                    : ('warning' as State),
              lastAt: backup.finished_at.toISOString(),
              sizeBytes: Number(backup.size_bytes),
              encrypted: backup.encrypted,
            }
          : { state: 'error' as State, lastAt: null },
        disk: {
          state:
            freeShare === null
              ? ('unknown' as State)
              : freeShare < STATUS_LIMITS.diskMinFree / 2
                ? ('error' as State)
                : freeShare < STATUS_LIMITS.diskMinFree
                  ? ('warning' as State)
                  : ('ok' as State),
          freeBytes: diskInfo?.freeBytes ?? null,
          totalBytes: diskInfo?.totalBytes ?? null,
          databaseBytes: Number(size?.database ?? 0),
          mediaBytes: Number(size?.media ?? 0),
        },
        processing: {
          state:
            oldest && now - oldest.getTime() > STATUS_LIMITS.processingMaxWaitMs
              ? ('warning' as State)
              : ('ok' as State),
          waiting: Number(processing.waiting),
          oldestAt: oldest?.toISOString() ?? null,
        },
        usage: {
          organizations: Number(counts?.organizations ?? 0),
          users: Number(counts?.users ?? 0),
          screens: Number(counts?.screens ?? 0),
          online: Number(counts?.online ?? 0),
        },
        mail: {
          state: ctx.env.MAIL_TRANSPORT === 'smtp' ? ('ok' as State) : ('warning' as State),
          transport: ctx.env.MAIL_TRANSPORT,
        },
      },
    };
  });
}
