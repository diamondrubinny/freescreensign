import type {} from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../../config/env.js';
import type { AppContext } from '../../context.js';
import type { User } from '../../db/schema.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Avoid a DB write on every request: refresh sliding expiry at most this often. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieName(env: Env): string {
  // The __Host- prefix pins the cookie to this exact host, path "/" and HTTPS.
  return env.PUBLIC_URL.startsWith('https://') ? '__Host-rubinny_session' : 'rubinny_session';
}

export interface AuthState {
  user: User;
  sessionIdHash: string;
}

export function clientIp(request: FastifyRequest): string {
  return request.ip;
}

export async function createSession(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  const absolute = new Date(now + ctx.env.SESSION_ABSOLUTE_DAYS * DAY_MS);
  const expires = new Date(Math.min(now + ctx.env.SESSION_TTL_DAYS * DAY_MS, absolute.getTime()));
  await ctx.db
    .insertInto('sessions')
    .values({
      id_hash: sha256Hex(token),
      user_id: userId,
      expires_at: expires,
      absolute_expires_at: absolute,
      last_seen_at: new Date(now),
      ip_hmac: ctx.keys.hashIp(clientIp(request)),
      user_agent: request.headers['user-agent']?.slice(0, 200) ?? null,
    })
    .execute();
  reply.setCookie(sessionCookieName(ctx.env), token, {
    path: '/',
    httpOnly: true,
    secure: ctx.env.PUBLIC_URL.startsWith('https://'),
    sameSite: 'lax',
    expires: absolute,
  });
}

export function clearSessionCookie(env: Env, reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName(env), {
    path: '/',
    httpOnly: true,
    secure: env.PUBLIC_URL.startsWith('https://'),
    sameSite: 'lax',
  });
}

/** Resolves the session cookie to an active user, extending the sliding expiry. */
export async function resolveSession(ctx: AppContext, token: string): Promise<AuthState | null> {
  if (token.length < 20 || token.length > 100) return null;
  const idHash = sha256Hex(token);
  const now = new Date();
  const row = await ctx.db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .selectAll('users')
    .select([
      'sessions.last_seen_at as session_last_seen_at',
      'sessions.absolute_expires_at as session_absolute_expires_at',
    ])
    .where('sessions.id_hash', '=', idHash)
    .where('sessions.expires_at', '>', now)
    .where('sessions.absolute_expires_at', '>', now)
    .where('users.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;

  const { session_last_seen_at: lastSeen, session_absolute_expires_at: absolute, ...user } = row;
  if (now.getTime() - lastSeen.getTime() > TOUCH_INTERVAL_MS) {
    const expires = new Date(
      Math.min(now.getTime() + ctx.env.SESSION_TTL_DAYS * DAY_MS, absolute.getTime()),
    );
    await ctx.db
      .updateTable('sessions')
      .set({ last_seen_at: now, expires_at: expires })
      .where('id_hash', '=', idHash)
      .execute();
  }
  return { user, sessionIdHash: idHash };
}

export async function revokeUserSessions(
  ctx: AppContext,
  userId: string,
  exceptIdHash?: string,
): Promise<void> {
  let query = ctx.db.deleteFrom('sessions').where('user_id', '=', userId);
  if (exceptIdHash) query = query.where('id_hash', '!=', exceptIdHash);
  await query.execute();
}
