import { randomBytes } from 'node:crypto';
import type { AppContext } from '../../context.js';
import type { User } from '../../db/schema.js';
import { sha256Hex } from '../../lib/crypto.js';
import { base32Decode, base32Encode, verifyTotp } from '../../lib/totp.js';

const RECOVERY_CODE_COUNT = 10;

export function mfaAad(userId: string): string {
  return `mfa-secret:${userId}`;
}

/** Verifies a TOTP code against the user's active secret and records the step (replay-safe). */
export async function verifyUserTotp(ctx: AppContext, user: User, code: string): Promise<boolean> {
  if (!user.mfa_secret_enc) return false;
  const secret = base32Decode(ctx.keys.decrypt(user.mfa_secret_enc, mfaAad(user.id)));
  const lastUsedStep = user.mfa_last_step === null ? null : Number(user.mfa_last_step);
  const step = verifyTotp(secret, code, Date.now(), { lastUsedStep });
  if (step === null) return false;
  // Conditional update guarantees a step can be used only once, even under concurrency.
  const updated = await ctx.db
    .updateTable('users')
    .set({ mfa_last_step: step })
    .where('id', '=', user.id)
    .where((eb) => eb.or([eb('mfa_last_step', 'is', null), eb('mfa_last_step', '<', String(step))]))
    .executeTakeFirst();
  return updated.numUpdatedRows > 0n;
}

function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function recoveryHash(normalizedCode: string): string {
  return sha256Hex(`rubinny-recovery:${normalizedCode}`);
}

/** Replaces all recovery codes; returns the plaintext codes (shown to the user once). */
export async function regenerateRecoveryCodes(ctx: AppContext, userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await ctx.db.transaction().execute(async (trx) => {
    await trx.deleteFrom('recovery_codes').where('user_id', '=', userId).execute();
    await trx
      .insertInto('recovery_codes')
      .values(
        codes.map((code) => ({ user_id: userId, code_hash: recoveryHash(code.replace('-', '')) })),
      )
      .execute();
  });
  return codes;
}

/** Atomically consumes a recovery code. `normalizedCode` has no dashes and is uppercase. */
export async function consumeRecoveryCode(
  ctx: AppContext,
  userId: string,
  normalizedCode: string,
): Promise<boolean> {
  const result = await ctx.db
    .updateTable('recovery_codes')
    .set({ used_at: new Date() })
    .where('user_id', '=', userId)
    .where('code_hash', '=', recoveryHash(normalizedCode))
    .where('used_at', 'is', null)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}
