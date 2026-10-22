// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** 256-bit random token, URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const KEY_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Purpose-specific keys derived from the master ENCRYPTION_KEY with HKDF-SHA256,
 * so a leak of one derived key does not expose the others.
 */
export class KeyRing {
  readonly #encryptionKey: Buffer;
  readonly #ipHmacKey: Buffer;

  constructor(masterKeyBase64: string) {
    const master = Buffer.from(masterKeyBase64, 'base64');
    if (master.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes');
    const derive = (info: string) =>
      Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
    this.#encryptionKey = derive('rubinny/v1/secret-encryption');
    this.#ipHmacKey = derive('rubinny/v1/ip-hmac');
  }

  /** AES-256-GCM. Output layout: version(1) | iv(12) | tag(16) | ciphertext. */
  encrypt(plaintext: string, associatedData: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.#encryptionKey, iv);
    cipher.setAAD(Buffer.from(associatedData));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([KEY_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(payload: Buffer, associatedData: string): string {
    if (payload.length < 1 + IV_BYTES + TAG_BYTES || payload[0] !== KEY_VERSION) {
      throw new Error('Unsupported ciphertext');
    }
    const iv = payload.subarray(1, 1 + IV_BYTES);
    const tag = payload.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.#encryptionKey, iv);
    decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(payload.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Pseudonymous, non-reversible IP identifier for audit/security logs. */
  hashIp(ip: string): string {
    return createHmac('sha256', this.#ipHmacKey).update(ip).digest('hex').slice(0, 32);
  }
}
