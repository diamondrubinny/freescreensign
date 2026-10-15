import { describe, expect, it } from 'vitest';
import {
  PAIRING_ALPHABET,
  PAIRING_CODE_LENGTH,
  formatPairingCode,
  generatePairingCode,
  normalizePairingCode,
} from '../src/pairing.js';

describe('generatePairingCode', () => {
  it('produces codes of the expected length using only the safe alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = generatePairingCode();
      expect(code).toHaveLength(PAIRING_CODE_LENGTH);
      for (const char of code) expect(PAIRING_ALPHABET).toContain(char);
    }
  });

  it('rejects biased bytes (rejection sampling)', () => {
    // 248 is the first byte value above the unbiased limit for a 31-char alphabet.
    let call = 0;
    const random = (bytes: Uint8Array) => {
      bytes.fill(call++ === 0 ? 255 : 0);
      return bytes;
    };
    expect(generatePairingCode(random)).toBe(PAIRING_ALPHABET[0]!.repeat(PAIRING_CODE_LENGTH));
    expect(call).toBe(2);
  });

  it('never contains ambiguous characters', () => {
    expect(PAIRING_ALPHABET).not.toMatch(/[01OIL]/);
  });
});

describe('normalizePairingCode', () => {
  it.each([
    ['k7q-29m', 'K7Q29M'],
    [' K7Q 29M ', 'K7Q29M'],
    ['K7Q29M', 'K7Q29M'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizePairingCode(input)).toBe(expected);
  });

  it.each(['', 'K7Q29', 'K7Q29MX', 'K0Q29M', 'K7Q<29', 'K7Q29M;DROP'])('rejects %j', (input) => {
    expect(normalizePairingCode(input)).toBeNull();
  });
});

describe('formatPairingCode', () => {
  it('inserts a separator in the middle', () => {
    expect(formatPairingCode('K7Q29M')).toBe('K7Q-29M');
  });
});
