import { rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** File the worker touches while it is healthy; read by the container health check. */
export const HEARTBEAT_FILE = join(tmpdir(), 'rubinny-worker.heartbeat');
export const HEARTBEAT_INTERVAL_MS = 10_000;
/** A heartbeat older than this means the event loop is stuck or the worker stopped. */
export const HEARTBEAT_MAX_AGE_MS = 45_000;

/**
 * Writes the current time to `file` immediately and then every `intervalMs`, but only while
 * `isHealthy()` holds. Returns a stop function that also removes the file.
 */
export async function startHeartbeat(
  isHealthy: () => boolean,
  options: { file?: string; intervalMs?: number; onError?: (err: unknown) => void } = {},
): Promise<() => Promise<void>> {
  const file = options.file ?? HEARTBEAT_FILE;
  // A file left by an earlier run must never make a new process look healthy.
  await rm(file, { force: true });
  const beat = async () => {
    if (!isHealthy()) return;
    try {
      // Write then rename, so the health check never reads a half-written file.
      const temp = `${file}.${String(process.pid)}.tmp`;
      await writeFile(temp, String(Date.now()), { mode: 0o600 });
      await rename(temp, file);
    } catch (err) {
      options.onError?.(err);
    }
  };
  await beat();
  const timer = setInterval(() => void beat(), options.intervalMs ?? HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await rm(file, { force: true });
  };
}

/** True when `content` holds a timestamp no older than `maxAgeMs`. */
export function isHeartbeatFresh(
  content: string,
  now = Date.now(),
  maxAgeMs = HEARTBEAT_MAX_AGE_MS,
): boolean {
  const at = Number(content.trim());
  return Number.isFinite(at) && at > 0 && now - at <= maxAgeMs && at <= now + 5_000;
}
