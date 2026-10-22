// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Storage } from '../lib/storage.js';
import { contentDisposition } from './names.js';
import { parseRange } from './range.js';

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
  filename: string;
  etag: string | null;
  cacheControl: string;
}

/** Streams an object from the media bucket with Range, ETag and hardening headers. */
export async function sendStoredFile(
  storage: Storage,
  request: FastifyRequest,
  reply: FastifyReply,
  file: StoredFile,
) {
  const range = parseRange(request.headers.range, file.size);
  void reply
    .header('content-type', file.contentType)
    .header('accept-ranges', 'bytes')
    .header('cache-control', file.cacheControl)
    .header('content-disposition', contentDisposition(file.filename))
    // Even if a browser opens the file directly, nothing in it may run.
    .header(
      'content-security-policy',
      "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    );
  if (file.etag) void reply.header('etag', `"${file.etag}"`);
  if (file.etag && request.headers['if-none-match'] === `"${file.etag}"`)
    return reply.status(304).send();

  if (range.type === 'unsatisfiable') {
    return reply
      .status(416)
      .header('content-range', `bytes */${String(file.size)}`)
      .send();
  }
  if (range.type === 'partial') {
    const object = await storage.get(
      storage.config.mediaBucket,
      file.key,
      `bytes=${String(range.start)}-${String(range.end)}`,
    );
    return reply
      .status(206)
      .header(
        'content-range',
        `bytes ${String(range.start)}-${String(range.end)}/${String(file.size)}`,
      )
      .header('content-length', String(range.end - range.start + 1))
      .send(object.body);
  }
  const object = await storage.get(storage.config.mediaBucket, file.key);
  return reply.header('content-length', String(object.contentLength)).send(object.body);
}
