import { describe, expect, it } from 'vitest';
import { KeyRing, randomToken, safeEqual, sha256Hex } from '../src/lib/crypto.js';
import { MemoryLimiter } from '../src/lib/limiter.js';
import { checkPassword, hashPassword, verifyPassword } from '../src/lib/password.js';
import { HttpError } from '../src/lib/http-error.js';
import { renderMail } from '../src/lib/mail/templates.js';

const key = Buffer.alloc(32, 7).toString('base64');

describe('KeyRing', () => {
  const keys = new KeyRing(key);

  it('round-trips encrypted values', () => {
    const encrypted = keys.encrypt('JBSWY3DPEHPK3PXP', 'mfa-secret:u1');
    expect(encrypted.toString('utf8')).not.toContain('JBSWY3DPEHPK3PXP');
    expect(keys.decrypt(encrypted, 'mfa-secret:u1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV for every encryption', () => {
    expect(keys.encrypt('same', 'a').equals(keys.encrypt('same', 'a'))).toBe(false);
  });

  it('rejects tampering and wrong associated data', () => {
    const encrypted = keys.encrypt('secret', 'mfa-secret:u1');
    expect(() => keys.decrypt(encrypted, 'mfa-secret:u2')).toThrow();
    const tampered = Buffer.from(encrypted);
    const last = tampered.length - 1;
    tampered.writeUInt8(tampered.readUInt8(last) ^ 1, last);
    expect(() => keys.decrypt(tampered, 'mfa-secret:u1')).toThrow();
  });

  it('rejects ciphertexts from another key', () => {
    const other = new KeyRing(Buffer.alloc(32, 9).toString('base64'));
    expect(() => other.decrypt(keys.encrypt('x', 'a'), 'a')).toThrow();
  });

  it('produces stable, non-reversible IP pseudonyms', () => {
    expect(keys.hashIp('203.0.113.7')).toBe(keys.hashIp('203.0.113.7'));
    expect(keys.hashIp('203.0.113.7')).not.toBe(keys.hashIp('203.0.113.8'));
    expect(keys.hashIp('203.0.113.7')).not.toContain('203');
  });

  it('requires a 32-byte key', () => {
    expect(() => new KeyRing(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('token helpers', () => {
  it('generates unique 256-bit tokens', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('hashes and compares safely', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password!!')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('applies the length-based policy', () => {
    expect(checkPassword('short')).toBe('too_short');
    expect(checkPassword('x'.repeat(129))).toBe('too_long');
    expect(checkPassword('Password123')).toBe('too_common');
    expect(checkPassword('dana.levi-2026!', 'dana.levi@example.com')).toBe('contains_email');
    expect(checkPassword('סיסמה ארוכה וטובה')).toBeNull();
    expect(checkPassword('correct horse battery staple')).toBeNull();
  });
});

describe('MemoryLimiter', () => {
  it('blocks after the limit with a retry hint and can be reset', async () => {
    const limiter = new MemoryLimiter();
    const rule = { name: 't', max: 2, windowSeconds: 60 };
    await limiter.hit(rule, 'k');
    await limiter.hit(rule, 'k');
    const error = await limiter.hit(rule, 'k').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(429);
    expect((error as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
    await limiter.hit(rule, 'other');
    await limiter.reset(rule, 'k');
    await limiter.hit(rule, 'k');
  });
});

describe('mail templates', () => {
  it('escapes HTML and sets direction per locale', () => {
    const mail = renderMail(
      {
        kind: 'invitation',
        url: 'https://x.example/a#token=1',
        orgName: '<b>Evil</b>',
        inviterName: 'דנה',
      },
      'he',
    );
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).not.toContain('<b>Evil</b>');
    expect(mail.html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    expect(mail.subject).toContain('<b>Evil</b>'); // plain-text header, not HTML
    expect(renderMail({ kind: 'verify-email', url: 'https://x' }, 'en').html).toContain(
      'dir="ltr"',
    );
  });
});
