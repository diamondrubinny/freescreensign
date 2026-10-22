// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { AppContext } from '../../context.js';
import type { TokenPurpose, User } from '../../db/schema.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';

const TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
  mfa_challenge: 5 * 60 * 1000,
};

/** Issues a single-use token; previous unused tokens of the same purpose are invalidated. */
export async function issueToken(
  ctx: AppContext,
  userId: string,
  purpose: TokenPurpose,
): Promise<string> {
  const token = randomToken();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('user_tokens')
      .where('user_id', '=', userId)
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .execute();
    await trx
      .insertInto('user_tokens')
      .values({
        token_hash: sha256Hex(token),
        user_id: userId,
        purpose,
        expires_at: new Date(Date.now() + TTL_MS[purpose]),
      })
      .execute();
  });
  return token;
}

/** Atomically consumes a valid token and returns its (active) user, or null. */
export async function consumeToken(
  ctx: AppContext,
  token: string,
  purpose: TokenPurpose,
): Promise<User | null> {
  if (token.length < 20 || token.length > 100) return null;
  const consumed = await ctx.db
    .updateTable('user_tokens')
    .set({ used_at: new Date() })
    .where('token_hash', '=', sha256Hex(token))
    .where('purpose', '=', purpose)
    .where('used_at', 'is', null)
    .where('expires_at', '>', new Date())
    .returning('user_id')
    .executeTakeFirst();
  if (!consumed) return null;
  const user = await ctx.db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', consumed.user_id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return user ?? null;
}

/** Links use the URL fragment so tokens never reach server logs or Referer headers. */
export function appLink(ctx: AppContext, path: string, token?: string): string {
  const url = new URL(path, ctx.env.PUBLIC_URL);
  if (token) url.hash = `token=${token}`;
  return url.toString();
}
