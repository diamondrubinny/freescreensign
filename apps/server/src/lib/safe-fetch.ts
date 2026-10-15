import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';

/**
 * Outbound HTTP(S) for server-side widget data (RSS, weather), hardened against SSRF:
 *
 * - http/https only, default ports only (unless `allowPrivate`).
 * - Every resolved address is checked at connect time through a custom `lookup`,
 *   so DNS rebinding cannot swap in a private address after validation.
 *   IP-literal hosts (which skip `lookup`) are checked up front.
 * - Redirects are followed manually (at most `maxRedirects`), each one re-validated.
 * - Overall timeout and a hard cap on the (decompressed) body size.
 * - No cookies, credentials or environment proxies are ever used.
 */

export class SafeFetchError extends Error {
  constructor(
    readonly reason:
      | 'invalid_url'
      | 'blocked_address'
      | 'too_many_redirects'
      | 'too_large'
      | 'timeout'
      | 'http_error'
      | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions {
  /** Tests and operator-configured endpoints only: allows private addresses and any port. */
  allowPrivate?: boolean;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  accept?: string;
}

export interface SafeFetchResponse {
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
}

export const USER_AGENT = 'Rubinny-Widgets/1.0 (+https://github.com/diamondrubinny/freescreensign)';

// ---- Address classification --------------------------------------------------

const blockedV4 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}

const blockedV6 = new net.BlockList();
for (const [network, prefix] of [
  ['2001::', 32], // Teredo (can tunnel to arbitrary IPv4)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds arbitrary IPv4)
] as const) {
  blockedV6.addSubnet(network, prefix, 'ipv6');
}
const globalUnicastV6 = new net.BlockList();
globalUnicastV6.addSubnet('2000::', 3, 'ipv6');

/** Expands an IPv6 address into its 8 16-bit groups. Returns null if malformed. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  // Trailing dotted IPv4 (e.g. ::ffff:10.0.0.1) becomes two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted?.[1]) {
    const v4 = dotted[1];
    if (!net.isIPv4(v4)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4.split('.').map(Number);
    text = `${text.slice(0, -v4.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string | undefined) =>
    part ? part.split(':').map((group) => Number.parseInt(group, 16)) : [];
  const head = parse(halves[0]);
  const tail = parse(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array<number>(Math.max(missing, 0)).fill(0), ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

function embeddedV4(groups: number[]): string {
  const hi = groups[6] ?? 0;
  const lo = groups[7] ?? 0;
  return `${String(hi >> 8)}.${String(hi & 0xff)}.${String(lo >> 8)}.${String(lo & 0xff)}`;
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) return !blockedV4.check(address, 'ipv4');
  if (!net.isIPv6(address)) return false;
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const prefix96Zero = groups.slice(0, 5).every((g) => g === 0);
  // IPv4-compatible (deprecated) addresses, incl. :: and ::1, are never allowed.
  if (prefix96Zero && groups[5] === 0) return false;
  // IPv4-mapped (::ffff:a.b.c.d): judge the embedded IPv4 address.
  if (prefix96Zero && groups[5] === 0xffff) return isPublicAddress(embeddedV4(groups));
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address too.
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isPublicAddress(embeddedV4(groups));
  }
  const normalized = groups.map((g) => g.toString(16)).join(':');
  // Everything outside 2000::/3 (ULA fc00::/7, link-local fe80::/10, multicast ff00::/8, …) is blocked.
  if (!globalUnicastV6.check(normalized, 'ipv6')) return false;
  return !blockedV6.check(normalized, 'ipv6');
}

// ---- Fetch -----------------------------------------------------------------

type LookupAddress = { address: string; family: number };

function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      const allowed = allowPrivate
        ? addresses
        : addresses.filter((entry) => isPublicAddress(entry.address));
      const first = allowed[0];
      if (!first) {
        callback(new SafeFetchError('blocked_address', 'Address not allowed'), '', 0);
        return;
      }
      if (options.all) {
        (callback as unknown as (err: null, addresses: LookupAddress[]) => void)(null, allowed);
      } else {
        callback(null, first.address, first.family);
      }
    });
  };
}

function validateUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('invalid_url', 'Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('invalid_url', 'Only http and https are allowed');
  }
  if (url.username || url.password) {
    throw new SafeFetchError('invalid_url', 'Credentials in URLs are not allowed');
  }
  if (!allowPrivate && url.port !== '') {
    // URL normalizes default ports to '', so any explicit port here is non-standard.
    throw new SafeFetchError('invalid_url', 'Only the default ports are allowed');
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  // IP literals never go through `lookup`, so check them here.
  if (net.isIP(host) !== 0 && !allowPrivate && !isPublicAddress(host)) {
    throw new SafeFetchError('blocked_address', 'Address not allowed');
  }
  return url;
}

function decode(response: http.IncomingMessage): Readable {
  const encoding = (response.headers['content-encoding'] ?? '').trim().toLowerCase();
  if (encoding === 'gzip' || encoding === 'x-gzip') return response.pipe(zlib.createGunzip());
  if (encoding === 'deflate') return response.pipe(zlib.createInflate());
  if (encoding === 'br') return response.pipe(zlib.createBrotliDecompress());
  return response;
}

interface Hop {
  status: number;
  location: string | null;
  contentType: string | null;
  body: Buffer | null;
}

function requestOnce(
  url: URL,
  options: Required<Pick<SafeFetchOptions, 'allowPrivate' | 'maxBytes' | 'accept'>>,
  signal: AbortSignal,
): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const onAbort = () => {
      reject(new SafeFetchError('timeout', 'Request timed out'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: guardedLookup(options.allowPrivate),
        signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: options.accept,
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = response.headers['content-type'] ?? null;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ status, location: response.headers.location, contentType, body: null });
          return;
        }
        const declared = Number(response.headers['content-length'] ?? '0');
        if (declared > options.maxBytes) {
          response.destroy();
          reject(new SafeFetchError('too_large', 'Response too large'));
          return;
        }
        response.on('error', () => {
          reject(new SafeFetchError('network', 'Connection lost'));
        });
        const stream = decode(response);
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            stream.destroy();
            reject(new SafeFetchError('too_large', 'Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('error', () => {
          reject(new SafeFetchError('network', 'Failed to read the response'));
        });
        stream.on('end', () => {
          resolve({ status, location: null, contentType, body: Buffer.concat(chunks) });
        });
      },
    );
    request.on('error', (error) => {
      if (error instanceof SafeFetchError) reject(error);
      else if (signal.aborted) reject(new SafeFetchError('timeout', 'Request timed out'));
      else reject(new SafeFetchError('network', 'Request failed'));
    });
    request.end();
  });
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
  const allowPrivate = options.allowPrivate ?? false;
  const maxRedirects = options.maxRedirects ?? 3;
  const settings = {
    allowPrivate,
    maxBytes: options.maxBytes ?? 1024 * 1024,
    accept: options.accept ?? '*/*',
  };
  const signal = AbortSignal.timeout(options.timeoutMs ?? 5000);

  let url = validateUrl(rawUrl, allowPrivate);
  for (let hop = 0; ; hop++) {
    const result = await requestOnce(url, settings, signal).catch((error: unknown) => {
      if (signal.aborted && !(error instanceof SafeFetchError && error.reason !== 'network')) {
        throw new SafeFetchError('timeout', 'Request timed out');
      }
      throw error;
    });
    if (result.location !== null) {
      if (hop >= maxRedirects) throw new SafeFetchError('too_many_redirects', 'Too many redirects');
      let next: string;
      try {
        next = new URL(result.location, url).toString();
      } catch {
        throw new SafeFetchError('invalid_url', 'Invalid redirect');
      }
      url = validateUrl(next, allowPrivate);
      continue;
    }
    if (result.status < 200 || result.status >= 300 || !result.body) {
      throw new SafeFetchError('http_error', `Upstream responded with ${String(result.status)}`);
    }
    return {
      url: url.toString(),
      status: result.status,
      contentType: result.contentType,
      body: result.body,
    };
  }
}
