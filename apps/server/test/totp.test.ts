// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  totp,
  totpUri,
  verifyTotp,
} from '../src/lib/totp.js';

const sha1Secret = Buffer.from('12345678901234567890');

describe('base32 (RFC 4648 test vectors)', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('%j <-> %j', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(plain);
  });

  it('decodes case-insensitively and ignores padding/spaces', () => {
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
  });

  it('rejects invalid characters', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('HOTP (RFC 4226 appendix D)', () => {
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];
  it.each(expected.map((code, counter) => [counter, code] as const))(
    'counter %i -> %s',
    (counter, code) => {
      expect(hotp(sha1Secret, counter)).toBe(code);
    },
  );
});

describe('TOTP (RFC 6238 appendix B)', () => {
  const sha256Secret = Buffer.from('12345678901234567890123456789012');
  const sha512Secret = Buffer.from(
    '1234567890123456789012345678901234567890123456789012345678901234',
  );
  it.each([
    [59, 'sha1', '94287082'],
    [1111111109, 'sha1', '07081804'],
    [1111111111, 'sha1', '14050471'],
    [1234567890, 'sha1', '89005924'],
    [2000000000, 'sha1', '69279037'],
    [20000000000, 'sha1', '65353130'],
    [59, 'sha256', '46119246'],
    [1111111109, 'sha256', '68084774'],
    [59, 'sha512', '90693936'],
    [1111111109, 'sha512', '25091201'],
  ] as const)('t=%i %s -> %s', (seconds, algorithm, code) => {
    const secret = { sha1: sha1Secret, sha256: sha256Secret, sha512: sha512Secret }[algorithm];
    expect(totp(secret, seconds * 1000, { digits: 8, algorithm })).toBe(code);
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;
  const secret = sha1Secret;

  it('accepts the current code and ±1 step for clock drift', () => {
    expect(verifyTotp(secret, totp(secret, now), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now + 30_000), now)).not.toBeNull();
  });

  it('rejects codes outside the window', () => {
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
  });

  it('rejects replays of an already used step', () => {
    const code = totp(secret, now);
    const step = verifyTotp(secret, code, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, now, { lastUsedStep: step })).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });
});

describe('secrets and URIs', () => {
  it('generates 160-bit base32 secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('builds an otpauth URI', () => {
    const uri = totpUri({
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'dana@example.com',
      issuer: 'Rubinny',
    });
    expect(uri).toBe(
      'otpauth://totp/Rubinny%3Adana%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Rubinny&algorithm=SHA1&digits=6&period=30',
    );
  });
});
