import type { Redis } from 'ioredis';

/** Small string cache for derived, non-personal data (e.g. widget feeds). */
export interface KvCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Valkey/Redis cache. Fails open: errors behave like a cache miss. */
export class RedisKvCache implements KvCache {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rubinny:cache:',
  ) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(this.prefix + key).catch(() => null);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.prefix + key, value, 'EX', ttlSeconds).catch(() => undefined);
  }
}

/** In-process cache for development and unit tests. */
export class MemoryKvCache implements KvCache {
  readonly #entries = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): Promise<string | null> {
    const entry = this.#entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}
