import { hash, verify } from '@node-rs/argon2';

/** OWASP minimum recommendation for Argon2id (2024+): m=19 MiB, t=2, p=1. */
const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum; inlined to keep isolatedModules happy)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Spends the same time as a real verification, to avoid user-enumeration by timing. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('rubinny-timing-equalizer-password');
  await verifyPassword(await dummyHash, password);
  return false;
}

export type PasswordProblem = 'too_short' | 'too_long' | 'contains_email' | 'too_common';

// A tiny deny-list of the most common passwords; a larger list can be plugged in later.
const COMMON = new Set([
  'password123',
  'password1234',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'iloveyou123',
  'admin12345',
  'welcome123',
  'abc1234567',
  'qwerty12345',
]);

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Counts user-perceived characters (so emoji/Hebrew with niqqud count once). */
function graphemeLength(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

/** NIST SP 800-63B style policy: length-based, no composition rules. */
export function checkPassword(password: string, email?: string): PasswordProblem | null {
  if (graphemeLength(password) < PASSWORD_MIN_LENGTH) return 'too_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'too_common';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'contains_email';
  return null;
}
