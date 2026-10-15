import { createHmac, randomBytes } from 'node:crypto';

/** RFC 4648 base32 (no padding), as used by authenticator apps. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32.charAt((value << (5 - bits)) & 31);
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export interface TotpOptions {
  digits?: number;
  periodSeconds?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
}

const DEFAULTS: Required<TotpOptions> = { digits: 6, periodSeconds: 30, algorithm: 'sha1' };

/** RFC 4226 HOTP. */
export function hotp(secret: Buffer, counter: number, options: TotpOptions = {}): string {
  const { digits, algorithm } = { ...DEFAULTS, ...options };
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function timeStep(nowMs: number, periodSeconds = DEFAULTS.periodSeconds): number {
  return Math.floor(nowMs / 1000 / periodSeconds);
}

/** RFC 6238 TOTP for a given time. */
export function totp(secret: Buffer, nowMs: number, options: TotpOptions = {}): string {
  return hotp(secret, timeStep(nowMs, options.periodSeconds), options);
}

/**
 * Verifies a code within ±window steps. Returns the matched time step so the
 * caller can reject replays (a step must be strictly greater than the last used one).
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  options: TotpOptions & { window?: number; lastUsedStep?: number | null } = {},
): number | null {
  const digits = options.digits ?? DEFAULTS.digits;
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return null;
  const current = timeStep(nowMs, options.periodSeconds);
  const window = options.window ?? 1;
  for (let step = current - window; step <= current + window; step++) {
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;
    if (hotp(secret, step, options) === code) return step;
  }
  return null;
}

export function generateTotpSecret(): string {
  // 160-bit secret, as recommended by RFC 4226.
  return base32Encode(randomBytes(20));
}

export function totpUri(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
