// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

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
  /** Throws 429 when the limit is already reached, without counting (checks before work). */
  check(rule: LimitRule, key: string): Promise<void>;
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

  async check(rule: LimitRule, key: string): Promise<void> {
    const storageKey = `${this.prefix}${rule.name}:${key}`;
    let count: number;
    let ttl: number;
    try {
      const results = await this.redis.multi().get(storageKey).ttl(storageKey).exec();
      if (!results) throw new Error('transaction aborted');
      count = Number(results[0]?.[1] ?? 0);
      ttl = Number(results[1]?.[1]);
    } catch {
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable');
    }
    if (count >= rule.max) throw rateLimited(Math.max(ttl, 1));
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

  check(rule: LimitRule, key: string): Promise<void> {
    const now = Date.now();
    const entry = this.#hits.get(`${rule.name}:${key}`);
    if (entry && entry.resetAt > now && entry.count >= rule.max) {
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
  mediaUploadUser: { name: 'media-upload-user', max: 120, windowSeconds: 3600 },
  pairStartIp: { name: 'pair-start-ip', max: 20, windowSeconds: 3600 },
  screenClaimUser: { name: 'screen-claim-user', max: 30, windowSeconds: 3600 },
  // A player uploads once a minute; this leaves room for catching up after an outage.
  playUploadScreen: { name: 'play-upload-screen', max: 240, windowSeconds: 3600 },
  screenshotScreen: { name: 'screenshot-screen', max: 6, windowSeconds: 60 },
  screenshotUser: { name: 'screenshot-user', max: 60, windowSeconds: 3600 },
  /** Outbound widget fetches (cache misses only) per organization. */
  widgetFetchOrg: { name: 'widget-fetch-org', max: 120, windowSeconds: 3600 },
  stockSearchUser: { name: 'stock-search-user', max: 120, windowSeconds: 3600 },
  stockImportUser: { name: 'stock-import-user', max: 60, windowSeconds: 3600 },
  alertStartOrg: { name: 'alert-start-org', max: 10, windowSeconds: 60 },
  /** Writing suggestions (each one costs the organization money on its own key). */
  aiSuggestUser: { name: 'ai-suggest-user', max: 20, windowSeconds: 600 },
  aiSuggestOrg: { name: 'ai-suggest-org', max: 200, windowSeconds: 3600 },
  /** Saving (and so verifying) an AI key. */
  aiKeyOrg: { name: 'ai-key-org', max: 10, windowSeconds: 3600 },
  /** The operator's server status page (each call runs several checks). */
  operatorStatusUser: { name: 'operator-status-user', max: 60, windowSeconds: 60 },
  /** SSO starts and callbacks per address. */
  oidcIp: { name: 'oidc-ip', max: 30, windowSeconds: 600 },
  // Booking at a room's screen: PIN attempts per screen (reset after a correct PIN), wrong
  // PINs per organization in 15 minutes and in a day (never reset: a correct PIN typed by
  // someone else must not give a guesser more tries; security review, finding C2), and
  // bookings per screen.
  roomPinScreen: { name: 'room-pin-screen', max: 5, windowSeconds: 900 },
  roomPinOrg: { name: 'room-pin-org', max: 30, windowSeconds: 900 },
  roomPinOrgDay: { name: 'room-pin-org-day', max: 100, windowSeconds: 86_400 },
  roomBookScreen: { name: 'room-book-screen', max: 4, windowSeconds: 3600 },
  /** Integrations: requests per API key, and failed key checks per address. */
  apiKeyRequests: { name: 'api-key-requests', max: 300, windowSeconds: 60 },
  apiKeyFailIp: { name: 'api-key-fail-ip', max: 30, windowSeconds: 600 },
  /** "Send a test" to a webhook. */
  webhookTestOrg: { name: 'webhook-test-org', max: 20, windowSeconds: 3600 },
} as const satisfies Record<string, LimitRule>;
