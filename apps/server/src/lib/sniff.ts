// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { createHash } from 'node:crypto';
import { PassThrough, Transform, type Readable, type TransformCallback } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';

const SNIFF_BYTES = 4100;

export interface SniffResult {
  /** Detected MIME type from magic bytes, or null if unknown. */
  mime: string | null;
  /** The full original stream (sniffed bytes are replayed first). */
  stream: Readable;
}

/** Reads the first bytes of a stream to detect its real type, without losing data. */
export async function sniffStream(input: Readable): Promise<SniffResult> {
  const chunks: Buffer[] = [];
  let size = 0;
  // destroyOnReturn: false keeps the source alive after `break` so the rest can be replayed.
  for await (const chunk of input.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    size += chunk.length;
    if (size >= SNIFF_BYTES) break;
  }
  const head = Buffer.concat(chunks);
  const type = await fileTypeFromBuffer(head);

  const replay = new PassThrough();
  replay.write(head);
  // `for await` + break leaves the source paused; resume piping the rest.
  input.pipe(replay);
  if (input.readableEnded) replay.end();
  return { mime: type?.mime ?? null, stream: replay };
}

/** Pass-through that computes sha256 and byte count, failing once `maxBytes` is exceeded. */
export class HashingCounter extends Transform {
  readonly #hash = createHash('sha256');
  bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new FileTooLargeError());
      return;
    }
    this.#hash.update(chunk);
    callback(null, chunk);
  }

  digest(): string {
    return this.#hash.digest('hex');
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super('File exceeds the size limit');
    this.name = 'FileTooLargeError';
  }
}
