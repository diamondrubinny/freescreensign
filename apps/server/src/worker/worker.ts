import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { MEDIA_QUEUE, queueConnection, type MediaJob } from '../queue.js';
import {
  deleteMediaJob,
  markProcessingError,
  processMediaJob,
  type WorkerDeps,
} from './media-job.js';

export function startMediaWorker(
  deps: WorkerDeps,
  options: { redisUrl: string; concurrency: number; prefix?: string },
): Worker<MediaJob> {
  const worker = new Worker<MediaJob>(
    MEDIA_QUEUE,
    async (job: Job<MediaJob>) => {
      const data = job.data;
      if (!/^[0-9a-f-]{36}$/.test(data.mediaId)) throw new UnrecoverableError('invalid media id');
      if (data.type === 'process') await processMediaJob(deps, data.mediaId);
      else await deleteMediaJob(deps, data.mediaId);
    },
    {
      connection: queueConnection(options.redisUrl),
      concurrency: options.concurrency,
      ...(options.prefix ? { prefix: options.prefix } : {}),
      // A single file must never block the worker forever.
      lockDuration: 10 * 60 * 1000,
    },
  );

  worker.on('failed', (job, error) => {
    if (!job) return;
    const final =
      job.attemptsMade >= (job.opts.attempts ?? 1) || error instanceof UnrecoverableError;
    deps.log.error(
      { jobId: job.id, type: job.data.type, attempts: job.attemptsMade, err: error },
      'media job failed',
    );
    if (final && job.data.type === 'process') void markProcessingError(deps.db, job.data.mediaId);
  });
  return worker;
}
