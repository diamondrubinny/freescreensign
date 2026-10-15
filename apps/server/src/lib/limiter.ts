import type { Redis } from 'ioredis';
import { HttpError } from './http-error.js';

export interface LimitRule {
  /** Logical name, part of the storage key. */
  name: string;
  max: number;
  windowSeconds: number;
}

export interface Limiter {
  /** Counts a hit; throws 429 when the limit is exceeded and 503 if the store fails. */
  hit(rule: LimitRule, key: string): Promise<void>;
  reset(rule: LimitRule, key: string): Promise<void>;
}

const rateLimited = (retryAfter: number) => {
  const error = new HttpError(429, 'RATE_LIMITED', 'Too many attempts, please try again later');
  Object.assign(error, { retryAfter });
  return error;
};

/** Fixed-window limiter in Valkey/Redis. Fails closed: store errors block the request. */
export class RedisLimiter implements Limiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rubinny:limit:',
  ) {}

  async hit(rule: LimitRule, key: string): Promise<void> {
    const storageKey = `${this.prefix}${rule.name}:${key}`;
    let count: number;
    let ttl: number;
    try {
      const results = await this.redis
        .multi()
        .incr(storageKey)
        .expire(storageKey, rule.windowSeconds, 'NX')
        .ttl(storageKey)
        .exec();
      if (!results) throw new Error('transaction aborted');
      count = Number(results[0]?.[1]);
      ttl = Number(results[2]?.[1]);
    } catch {
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable');
    }
    if (count > rule.max) throw rateLimited(Math.max(ttl, 1));
  }

  async reset(rule: LimitRule, key: string): Promise<void> {
    await this.redis.del(`${this.prefix}${rule.name}:${key}`).catch(() => undefined);
  }
}

/** In-process limiter for development and unit tests only (not shared across instances). */
export class MemoryLimiter implements Limiter {
  readonly #hits = new Map<string, { count: number; resetAt: number }>();

  hit(rule: LimitRule, key: string): Promise<void> {
    const now = Date.now();
    const storageKey = `${rule.name}:${key}`;
    let entry = this.#hits.get(storageKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
      this.#hits.set(storageKey, entry);
    }
    entry.count++;
    if (entry.count > rule.max) {
      return Promise.reject(rateLimited(Math.ceil((entry.resetAt - now) / 1000)));
    }
    return Promise.resolve();
  }

  reset(rule: LimitRule, key: string): Promise<void> {
    this.#hits.delete(`${rule.name}:${key}`);
    return Promise.resolve();
  }
}

export const LIMITS = {
  loginIp: { name: 'login-ip', max: 20, windowSeconds: 600 },
  loginEmail: { name: 'login-email', max: 5, windowSeconds: 900 },
  mfaChallenge: { name: 'mfa-challenge', max: 5, windowSeconds: 300 },
  mfaUser: { name: 'mfa-user', max: 10, windowSeconds: 900 },
  registerIp: { name: 'register-ip', max: 5, windowSeconds: 3600 },
  emailSendIp: { name: 'email-send-ip', max: 10, windowSeconds: 3600 },
  emailSendAddress: { name: 'email-send-address', max: 3, windowSeconds: 3600 },
  tokenRedeemIp: { name: 'token-redeem-ip', max: 20, windowSeconds: 3600 },
  setupIp: { name: 'setup-ip', max: 10, windowSeconds: 3600 },
  passwordChangeUser: { name: 'password-change-user', max: 10, windowSeconds: 3600 },
} as const satisfies Record<string, LimitRule>;
