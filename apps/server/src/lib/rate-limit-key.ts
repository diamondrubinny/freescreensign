// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyRequest } from 'fastify';
import { sha256Hex } from './crypto.js';

const MAX_REMEMBERED = 100_000;
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Credentials this process has verified: screens' device tokens and users' sessions, by hash.
 *
 * The global rate limit is per client, and many clients can share one address: a school's
 * screens and staff usually reach the server through one NAT address. A request carrying a
 * verified credential therefore gets its own budget. An unverified one (a random token, say)
 * stays on its IP's budget, so inventing tokens cannot escape the limit.
 */
export class VerifiedCredentials {
  readonly #hashes = new Map<string, true>();

  constructor(private readonly max = MAX_REMEMBERED) {}

  remember(key: string): void {
    this.#hashes.delete(key);
    this.#hashes.set(key, true);
    if (this.#hashes.size > this.max) {
      const oldest = this.#hashes.keys().next().value;
      if (oldest !== undefined) this.#hashes.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.#hashes.has(key);
  }
}

export const verifiedCredentials = new VerifiedCredentials();

export const deviceCredential = (tokenHash: string) => `device:${tokenHash}`;
export const sessionCredential = (idHash: string) => `session:${idHash}`;

/** The device token of a player request ("Authorization: Bearer …"), if well formed. */
export function deviceToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return DEVICE_TOKEN.test(token) ? token : null;
}

/** A cookie from the raw header (the rate limiter runs before cookies are parsed). */
function rawCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value.length >= 20 && value.length <= 100 ? value : null;
    }
  }
  return null;
}

/**
 * Lookups of unknown credentials are bounded per address, so inventing tokens cannot turn
 * the limiter into a source of database load. Credentials are also remembered when issued
 * (pairing, sign-in), so lookups are only needed after a restart.
 */
export class LookupBudget {
  readonly #windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 60,
    private readonly windowMs = 60_000,
  ) {}

  take(address: string, now = Date.now()): boolean {
    let window = this.#windows.get(address);
    if (!window || window.resetAt <= now) {
      if (this.#windows.size > 10_000) {
        for (const [key, value] of this.#windows)
          if (value.resetAt <= now) this.#windows.delete(key);
      }
      window = { count: 0, resetAt: now + this.windowMs };
      this.#windows.set(address, window);
    }
    window.count++;
    return window.count <= this.max;
  }
}

const lookupBudget = new LookupBudget();

/** Checks a credential that is not cached yet (one indexed lookup). */
export type CredentialCheck = (kind: 'device' | 'session', hash: string) => Promise<boolean>;

/**
 * The rate-limit bucket of a request: its verified credential, otherwise its IP address.
 * Unknown credentials are checked once (then cached), so a screen is never stuck on a
 * shared address's budget just because that budget ran out before its first request.
 */
export async function rateLimitKey(
  request: FastifyRequest,
  sessionCookieName: string,
  check?: CredentialCheck,
  credentials: VerifiedCredentials = verifiedCredentials,
  budget: LookupBudget = lookupBudget,
): Promise<string> {
  const address = request.ip || 'unknown';
  const verify = async (kind: 'device' | 'session', hash: string) =>
    check !== undefined && budget.take(address) && (await check(kind, hash));
  const token = request.url.startsWith('/player/v1/') ? deviceToken(request) : null;
  if (token) {
    const hash = sha256Hex(token);
    const key = deviceCredential(hash);
    if (credentials.has(key)) return key;
    if (await verify('device', hash)) {
      credentials.remember(key);
      return key;
    }
  }
  const session = rawCookie(request, sessionCookieName);
  if (session) {
    const hash = sha256Hex(session);
    const key = sessionCredential(hash);
    if (credentials.has(key)) return key;
    if (await verify('session', hash)) {
      credentials.remember(key);
      return key;
    }
  }
  return `ip:${address}`;
}
