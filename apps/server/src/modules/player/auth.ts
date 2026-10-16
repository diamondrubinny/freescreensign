import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../../context.js';
import type { Screen } from '../../db/schema.js';
import { sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { deviceCredential, verifiedCredentials } from '../../lib/rate-limit-key.js';

/** Resolves a device token to its (active) screen, or null. */
export async function findScreenByToken(ctx: AppContext, token: string): Promise<Screen | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = sha256Hex(token);
  const row = await ctx.db
    .selectFrom('screens')
    .innerJoin('organizations', 'organizations.id', 'screens.org_id')
    .selectAll('screens')
    .where('screens.token_hash', '=', tokenHash)
    .where('organizations.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  // From now on this screen has its own rate-limit budget (not its network's).
  verifiedCredentials.remember(deviceCredential(tokenHash));
  return row;
}

/** Player endpoints authenticate with "Authorization: Bearer <deviceToken>" (no cookies). */
export async function requireScreen(ctx: AppContext, request: FastifyRequest): Promise<Screen> {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const screen = token ? await findScreenByToken(ctx, token) : null;
  if (!screen) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or revoked device token');
  return screen;
}
