import { createServer, type Server } from 'node:net';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ScannerUnavailableError, scanStream } from '../../src/lib/clamav.js';
import { HashingCounter, FileTooLargeError, sniffStream } from '../../src/lib/sniff.js';
import { contentDisposition, displayName, sanitizeFilename } from '../../src/media/names.js';
import { parseRange } from '../../src/media/range.js';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

/** Minimal fake clamd implementing INSTREAM framing. */
function fakeClamd(
  reply: (payload: Buffer) => string | null,
): Promise<{ server: Server; port: number; received: () => Buffer }> {
  let received = Buffer.alloc(0);
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let buffer = Buffer.alloc(0);
      let headerSeen = false;
      socket.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        if (!headerSeen) {
          const end = buffer.indexOf(0);
          if (end === -1) return;
          expect(buffer.subarray(0, end).toString()).toBe('zINSTREAM');
          buffer = buffer.subarray(end + 1);
          headerSeen = true;
        }
        while (buffer.length >= 4) {
          const length = buffer.readUInt32BE(0);
          if (length === 0) {
            const answer = reply(received);
            if (answer === null) socket.destroy();
            else socket.end(`${answer}\0`);
            return;
          }
          if (buffer.length < 4 + length) return;
          received = Buffer.concat([received, buffer.subarray(4, 4 + length)]);
          buffer = buffer.subarray(4 + length);
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === 'object' && address ? address.port : 0,
        received: () => received,
      });
    });
  });
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
let servers: Server[] = [];
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});

describe('ClamAV INSTREAM client', () => {
  it('streams the whole file in framed chunks and reports clean files', async () => {
    const clamd = await fakeClamd(() => 'stream: OK');
    servers.push(clamd.server);
    const data = Buffer.alloc(200_000, 7);
    const result = await scanStream(Readable.from([data]), { host: '127.0.0.1', port: clamd.port });
    expect(result).toEqual({ clean: true });
    expect(clamd.received().equals(data)).toBe(true);
  });

  it('reports detected signatures', async () => {
    const clamd = await fakeClamd((payload) =>
      payload.toString().includes('EICAR') ? 'stream: Eicar-Test-Signature FOUND' : 'stream: OK',
    );
    servers.push(clamd.server);
    const result = await scanStream(Readable.from([Buffer.from(EICAR)]), {
      host: '127.0.0.1',
      port: clamd.port,
    });
    expect(result).toEqual({ clean: false, signature: 'Eicar-Test-Signature' });
  });

  it('fails closed on errors, disconnects and unreachable scanners', async () => {
    const limit = await fakeClamd(() => 'INSTREAM size limit exceeded. ERROR');
    const drop = await fakeClamd(() => null);
    servers.push(limit.server, drop.server);
    await expect(
      scanStream(Readable.from([Buffer.from('x')]), { host: '127.0.0.1', port: limit.port }),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
    await expect(
      scanStream(Readable.from([Buffer.from('x')]), { host: '127.0.0.1', port: drop.port }),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
    await expect(
      scanStream(Readable.from([Buffer.from('x')]), { host: '127.0.0.1', port: 1 }),
    ).rejects.toBeInstanceOf(ScannerUnavailableError);
  });
});

describe('sniffStream', () => {
  it('detects the real type from bytes and replays the full stream', async () => {
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const chunks = [png.subarray(0, 10), png.subarray(10, 3000), png.subarray(3000)];
    const { mime, stream } = await sniffStream(Readable.from(chunks));
    expect(mime).toBe('image/png');
    const out: Buffer[] = [];
    for await (const chunk of stream) out.push(chunk as Buffer);
    expect(Buffer.concat(out).equals(png)).toBe(true);
  });

  it('identifies disguised executables and unknown data', async () => {
    const exe = Buffer.concat([
      Buffer.from('MZ'),
      Buffer.alloc(100),
      Buffer.from('This program cannot be run in DOS mode'),
    ]);
    expect((await sniffStream(Readable.from([exe]))).mime).not.toMatch(/^image|^video/);
    expect(
      (await sniffStream(Readable.from([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')])))
        .mime,
    ).not.toBe('image/png');
    expect((await sniffStream(Readable.from([Buffer.from('hello')]))).mime).toBeNull();
  });
});

describe('HashingCounter', () => {
  it('hashes, counts and enforces the limit', async () => {
    const counter = new HashingCounter(10);
    const sink = new Writable({
      write: (_c, _e, cb) => {
        cb();
      },
    });
    await pipeline(Readable.from([Buffer.from('abc')]), counter, sink);
    expect(counter.bytes).toBe(3);
    expect(counter.digest()).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const small = new HashingCounter(2);
    await expect(
      pipeline(
        Readable.from([Buffer.from('abc')]),
        small,
        new Writable({
          write: (_c, _e, cb) => {
            cb();
          },
        }),
      ),
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });
});

describe('file names', () => {
  it('strips paths, control and bidi override characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\photo.jpg')).toBe('photo.jpg');
    expect(sanitizeFilename('invoice\u202Egpj.exe')).toBe('invoicegpj.exe');
    expect(sanitizeFilename('a\u0000b\nc.png')).toBe('abc.png');
    expect(sanitizeFilename('   ')).toBe('file');
    expect(sanitizeFilename('x'.repeat(400))).toHaveLength(255);
  });

  it('derives display names and safe Content-Disposition values', () => {
    expect(displayName('תפריט בוקר.jpg')).toBe('תפריט בוקר');
    expect(contentDisposition('תפריט "בוקר".jpg')).toBe(
      `inline; filename="_____ ______.jpg"; filename*=UTF-8''${encodeURIComponent('תפריט "בוקר".jpg')}`,
    );
  });
});

describe('parseRange', () => {
  it.each([
    [undefined, { type: 'full' }],
    ['bytes=0-99', { type: 'partial', start: 0, end: 99 }],
    ['bytes=100-', { type: 'partial', start: 100, end: 999 }],
    ['bytes=-100', { type: 'partial', start: 900, end: 999 }],
    ['bytes=900-5000', { type: 'partial', start: 900, end: 999 }],
    ['bytes=1000-', { type: 'unsatisfiable' }],
    ['bytes=5-1', { type: 'unsatisfiable' }],
    ['bytes=-0', { type: 'unsatisfiable' }],
    ['bytes=0-1,5-9', { type: 'full' }],
    ['items=0-1', { type: 'full' }],
  ] as const)('%s', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected);
  });
});
