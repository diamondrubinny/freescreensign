/**
 * Pairing codes are shown on a new screen and typed by a user in the CMS.
 * The alphabet omits look-alike characters (0, O, 1, I, L) so codes are easy
 * to read from across a room. Codes are short-lived and single-use; brute
 * force protection (expiry + rate limiting) is enforced by the server.
 */
export const PAIRING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIRING_CODE_LENGTH = 6;

const NORMALIZED_PATTERN = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);

type RandomSource = (bytes: Uint8Array) => Uint8Array;

const defaultRandom: RandomSource = (bytes) => globalThis.crypto.getRandomValues(bytes);

/**
 * Generates a normalized pairing code (e.g. "K7Q29M") using a CSPRNG.
 * Rejection sampling avoids modulo bias.
 */
export function generatePairingCode(random: RandomSource = defaultRandom): string {
  const alphabetSize = PAIRING_ALPHABET.length;
  const limit = 256 - (256 % alphabetSize);
  let code = '';
  while (code.length < PAIRING_CODE_LENGTH) {
    const buffer = random(new Uint8Array(PAIRING_CODE_LENGTH * 2));
    for (const byte of buffer) {
      if (byte < limit) {
        code += PAIRING_ALPHABET.charAt(byte % alphabetSize);
        if (code.length === PAIRING_CODE_LENGTH) break;
      }
    }
  }
  return code;
}

/** Normalizes user input ("k7q-29m ", "K7Q 29M") to "K7Q29M", or returns null if invalid. */
export function normalizePairingCode(input: string): string | null {
  const normalized = input.replace(/[\s-]/g, '').toUpperCase();
  return NORMALIZED_PATTERN.test(normalized) ? normalized : null;
}

/** Formats a normalized code for display: "K7Q29M" -> "K7Q-29M". */
export function formatPairingCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}
