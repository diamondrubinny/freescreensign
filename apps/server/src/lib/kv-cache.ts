// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { Redis } from 'ioredis';

/** Small string cache for derived, non-personal data (e.g. widget feeds). */
export interface KvCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Reads and removes a value atomically (one-time values such as sign-in state). */
  take(key: string): Promise<string | null>;
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

  async take(key: string): Promise<string | null> {
    return this.redis.getdel(this.prefix + key).catch(() => null);
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

  async take(key: string): Promise<string | null> {
    const value = await this.get(key);
    this.#entries.delete(key);
    return value;
  }
}
