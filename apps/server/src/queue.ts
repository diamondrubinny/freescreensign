import { Queue, type ConnectionOptions } from 'bullmq';

export const MEDIA_QUEUE = 'rubinny-media';

export type MediaJob = { type: 'process'; mediaId: string } | { type: 'delete'; mediaId: string };

/** BullMQ requires maxRetriesPerRequest: null on worker connections. */
export function queueConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.pathname.length > 1 ? { db: Number(url.pathname.slice(1)) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

export interface MediaQueue {
  enqueue(job: MediaJob): Promise<void>;
  close(): Promise<void>;
}

export function createMediaQueue(redisUrl: string, prefix?: string): MediaQueue {
  const queue = new Queue<MediaJob>(MEDIA_QUEUE, {
    connection: queueConnection(redisUrl),
    ...(prefix ? { prefix } : {}),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return {
    async enqueue(job) {
      // Deterministic job ids make enqueueing idempotent.
      await queue.add(job.type, job, { jobId: `${job.type}-${job.mediaId}` });
    },
    close: () => queue.close(),
  };
}
