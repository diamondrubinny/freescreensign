// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { Socket } from 'node:net';
import type { Readable } from 'node:stream';

export type ScanResult = { clean: true } | { clean: false; signature: string };

export class ScannerUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ScannerUnavailableError';
  }
}

const MAX_CHUNK = 64 * 1024;

/**
 * Scans a stream with clamd using the INSTREAM protocol:
 *   "zINSTREAM\0", then [uint32 BE length][bytes]..., then a zero-length chunk.
 * The reply is "stream: OK", "stream: <signature> FOUND" or an error.
 * Any protocol/connection problem throws ScannerUnavailableError (fail closed).
 */
export function scanStream(
  input: Readable,
  options: { host: string; port: number; timeoutMs?: number },
): Promise<ScanResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;

  return new Promise<ScanResult>((resolve, reject) => {
    const socket = new Socket();
    let reply = '';
    let settled = false;

    const finish = (error: Error | null, result?: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      input.destroy();
      if (error) reject(error);
      else if (result) resolve(result);
    };

    socket.setTimeout(timeoutMs, () => {
      finish(new ScannerUnavailableError('ClamAV scan timed out'));
    });
    socket.on('error', (err) => {
      finish(new ScannerUnavailableError('ClamAV connection failed', { cause: err }));
    });
    socket.on('data', (data) => {
      reply += data.toString('utf8');
      if (reply.includes('\0')) {
        const message = reply.slice(0, reply.indexOf('\0')).trim();
        const found = /^stream: (.+) FOUND$/.exec(message);
        if (message === 'stream: OK') finish(null, { clean: true });
        else if (found?.[1]) finish(null, { clean: false, signature: found[1] });
        else
          finish(new ScannerUnavailableError(`Unexpected ClamAV reply: ${message.slice(0, 200)}`));
      }
    });
    socket.on('end', () => {
      if (!settled)
        finish(new ScannerUnavailableError('ClamAV closed the connection without a verdict'));
    });

    socket.connect(options.port, options.host, () => {
      socket.write('zINSTREAM\0');
      input.on('data', (chunk: Buffer) => {
        for (let offset = 0; offset < chunk.length; offset += MAX_CHUNK) {
          const part = chunk.subarray(offset, offset + MAX_CHUNK);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(part.length);
          if (!socket.write(Buffer.concat([header, part]))) {
            input.pause();
            socket.once('drain', () => input.resume());
          }
        }
      });
      input.on('end', () => {
        socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
      });
      input.on('error', (err) => {
        finish(new ScannerUnavailableError('Failed to read file for scanning', { cause: err }));
      });
    });
  });
}

/** clamd's version line, e.g. "ClamAV 1.4.1/27431/Sat Oct 17 07:35:12 2026". */
export interface ClamavVersion {
  engine: string;
  /** Signature database version (daily.cvd), when clamd reports it. */
  signatures: number | null;
  /** When that database was built, when clamd reports it. */
  signaturesDate: Date | null;
}

export function parseClamavVersion(line: string): ClamavVersion {
  const [engine = '', signatures, date] = line.trim().split('/');
  const parsed = date ? new Date(`${date.replace(/^\w{3} /, '')} UTC`) : null;
  return {
    engine: engine.replace(/^ClamAV\s*/, ''),
    signatures: signatures && /^\d+$/.test(signatures) ? Number(signatures) : null,
    signaturesDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  };
}

/** Asks clamd for its engine and signature versions (the status page). */
export function clamavVersion(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<ClamavVersion> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let reply = '';
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error('ClamAV version timed out'));
    });
    socket.on('error', reject);
    socket.on('data', (data) => {
      reply += data.toString('utf8');
      if (reply.includes('\0')) {
        socket.destroy();
        resolve(parseClamavVersion(reply.replace(/\0.*$/s, '')));
      }
    });
    socket.on('end', () => {
      resolve(parseClamavVersion(reply.replace(/\0.*$/s, '')));
    });
    socket.connect(port, host, () => socket.write('zVERSION\0'));
  });
}

/** Checks that clamd answers PING (used for readiness). */
export function pingClamav(host: string, port: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error('ClamAV ping timed out'));
    });
    socket.on('error', reject);
    socket.on('data', (data) => {
      socket.destroy();
      if (data.toString('utf8').startsWith('PONG')) resolve();
      else reject(new Error('Unexpected ClamAV ping reply'));
    });
    socket.connect(port, host, () => socket.write('zPING\0'));
  });
}
