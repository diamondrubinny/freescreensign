// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import type { AppContext } from '../../src/context.js';
import { HttpError } from '../../src/lib/http-error.js';
import { MemoryKvCache } from '../../src/lib/kv-cache.js';
import { SafeFetchError, isPublicAddress, safeFetch } from '../../src/lib/safe-fetch.js';
import { FeedParseError, parseFeed, toPlainText } from '../../src/modules/widgets/rss.js';
import {
  WEATHER_ATTRIBUTION,
  WeatherParseError,
  parseWeather,
  weatherRequestUrl,
} from '../../src/modules/widgets/weather.js';
import { validateWidgetConfig } from '../../src/modules/widgets/routes.js';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '198.18.0.1',
    '::',
    '::1',
    '::127.0.0.1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::',
    '2001:0:4136:e378::1',
    '2001:db8::1',
    'fe80::1%eth0',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.215.14',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('safeFetch', () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '/';
      if (url === '/ok') {
        response.writeHead(200, { 'content-type': 'text/plain' }).end('hello');
      } else if (url === '/gzip') {
        response
          .writeHead(200, { 'content-encoding': 'gzip' })
          .end(zlib.gzipSync(Buffer.from('compressed')));
      } else if (url === '/bomb') {
        response
          .writeHead(200, { 'content-encoding': 'gzip' })
          .end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024)));
      } else if (url === '/big') {
        response.writeHead(200).end(Buffer.alloc(2 * 1024 * 1024));
      } else if (url.startsWith('/redirect/')) {
        const n = Number(url.split('/')[2]);
        response.writeHead(302, { location: n > 0 ? `/redirect/${String(n - 1)}` : '/ok' }).end();
      } else if (url === '/to-file') {
        response.writeHead(302, { location: 'file:///etc/passwd' }).end();
      } else if (url === '/to-credentials') {
        response.writeHead(302, { location: 'http://admin:secret@example.com/' }).end();
      } else if (url === '/slow') {
        setTimeout(() => response.writeHead(200).end('late'), 2000);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });
  afterAll(
    () =>
      new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  );

  const allow = { allowPrivate: true };
  const reason = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      if (error instanceof SafeFetchError) return error.reason;
      throw error;
    }
    return 'resolved';
  };

  it('fetches and decompresses', async () => {
    expect((await safeFetch(`${base}/ok`, allow)).body.toString()).toBe('hello');
    expect((await safeFetch(`${base}/gzip`, allow)).body.toString()).toBe('compressed');
  });

  it('blocks private addresses, odd ports and non-http schemes by default', async () => {
    expect(await reason(safeFetch(`${base}/ok`))).toBe('invalid_url'); // explicit port
    expect(await reason(safeFetch('http://127.0.0.1/ok'))).toBe('blocked_address');
    expect(await reason(safeFetch('http://[::1]/ok'))).toBe('blocked_address');
    expect(await reason(safeFetch('http://[::ffff:127.0.0.1]/'))).toBe('blocked_address');
    expect(await reason(safeFetch('http://169.254.169.254/latest/meta-data'))).toBe(
      'blocked_address',
    );
    // A hostname resolving to loopback is caught at connect time.
    expect(await reason(safeFetch('http://localhost/'))).toBe('blocked_address');
    expect(await reason(safeFetch('file:///etc/passwd'))).toBe('invalid_url');
    expect(await reason(safeFetch('ftp://example.com/'))).toBe('invalid_url');
    expect(await reason(safeFetch('http://user:pass@example.com/'))).toBe('invalid_url');
  });

  it('re-validates every redirect and limits their number', async () => {
    expect((await safeFetch(`${base}/redirect/2`, allow)).body.toString()).toBe('hello');
    expect(await reason(safeFetch(`${base}/redirect/5`, allow))).toBe('too_many_redirects');
    // Every hop goes through the same URL validation as the first request.
    expect(await reason(safeFetch(`${base}/to-file`, allow))).toBe('invalid_url');
    expect(await reason(safeFetch(`${base}/to-credentials`, allow))).toBe('invalid_url');
  });

  it('caps the body size, including decompressed bombs', async () => {
    expect(await reason(safeFetch(`${base}/big`, allow))).toBe('too_large');
    expect(await reason(safeFetch(`${base}/bomb`, allow))).toBe('too_large');
  });

  it('times out', async () => {
    expect(await reason(safeFetch(`${base}/slow`, { ...allow, timeoutMs: 200 }))).toBe('timeout');
  });

  it('reports upstream errors', async () => {
    expect(await reason(safeFetch(`${base}/missing`, allow))).toBe('http_error');
  });
});

describe('parseFeed', () => {
  it('parses RSS 2.0 as plain text', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>חדשות &amp; עדכונים</title>
      <item><title><![CDATA[<b>Bold</b> &amp; <script>alert(1)</script>news]]></title><pubDate>Tue, 13 Oct 2026 08:00:00 GMT</pubDate></item>
      <item><title>Second &lt;i&gt;item&lt;/i&gt; &#x5E9;&#1500;</title></item>
      <item><title></title></item>
      <item><title>Third</title></item></channel></rss>`;
    expect(parseFeed(xml, 2)).toEqual({
      title: 'חדשות & עדכונים',
      items: [
        { title: 'Bold & alert(1) news', published: '2026-10-13T08:00:00.000Z' },
        { title: 'Second item של', published: null },
      ],
    });
  });

  it('parses Atom and RDF feeds', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">Atom</title>
      <entry><title type="html">One</title><updated>2026-10-01T10:00:00Z</updated></entry></feed>`;
    expect(parseFeed(atom, 5)).toEqual({
      title: 'Atom',
      items: [{ title: 'One', published: '2026-10-01T10:00:00.000Z' }],
    });
    const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>RDF</title></channel><item><title>A</title><dc:date>2026-10-02T00:00:00Z</dc:date></item></rdf:RDF>`;
    expect(parseFeed(rdf, 5).items).toEqual([
      { title: 'A', published: '2026-10-02T00:00:00.000Z' },
    ]);
  });

  it('rejects DTDs (entity expansion) and non-feeds', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><rss><channel><title>&lol;</title></channel></rss>`;
    expect(() => parseFeed(bomb, 5)).toThrow(FeedParseError);
    expect(() => parseFeed('<html><body>hi</body></html>', 5)).toThrow(FeedParseError);
    expect(() => parseFeed('not xml at all <<<', 5)).toThrow(FeedParseError);
  });

  it('strips control characters and truncates', () => {
    expect(toPlainText(`a\u0007b‮`)).toBe('a b‮');
    expect(toPlainText('x'.repeat(400))).toHaveLength(300);
  });
});

describe('weather', () => {
  const config = {
    latitude: 32.0853,
    longitude: 34.7818,
    locationName: 'Tel Aviv',
    units: 'metric' as const,
    days: 2,
    locale: 'he' as const,
    textColor: '#ffffff',
    background: '#000000',
  };

  it('builds the request with documented parameters', () => {
    const url = new URL(
      weatherRequestUrl(
        'https://customer-api.open-meteo.com/v1/forecast',
        { ...config, units: 'imperial' },
        'k3y',
      ),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '32.0853',
      longitude: '34.7818',
      current: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '2',
      temperature_unit: 'fahrenheit',
      apikey: 'k3y',
    });
  });

  it('normalizes the response', () => {
    const data = parseWeather(
      {
        current: { temperature_2m: 24.6, weather_code: 1 },
        daily: {
          time: ['2026-10-15', '2026-10-16', '2026-10-17'],
          weather_code: [1, 61, 3],
          temperature_2m_max: [27.2, 25.5, 26],
          temperature_2m_min: [19.4, null, 18],
        },
      },
      config,
    );
    expect(data).toEqual({
      units: 'metric',
      current: { temperature: 25, weatherCode: 1 },
      daily: [
        { date: '2026-10-15', min: 19, max: 27, weatherCode: 1 },
        { date: '2026-10-17', min: 18, max: 26, weatherCode: 3 },
      ],
      attribution: WEATHER_ATTRIBUTION,
    });
    expect(() => parseWeather({ current: { temperature_2m: 'hot' } }, config)).toThrow(
      WeatherParseError,
    );
  });
});

describe('widget configuration', () => {
  it('refuses WIDGET_FETCH_ALLOW_PRIVATE in production', () => {
    const base = {
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://signage.example.com',
      DATABASE_URL: 'postgres://u:p@db/rubinny',
      REDIS_URL: 'redis://valkey:6379',
      ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      SETUP_TOKEN: 'a'.repeat(32),
    };
    expect(() => loadEnv(base)).not.toThrow();
    expect(() => loadEnv({ ...base, WIDGET_FETCH_ALLOW_PRIVATE: 'true' })).toThrow(
      /WIDGET_FETCH_ALLOW_PRIVATE/,
    );
  });

  it('memory cache expires entries', async () => {
    const cache = new MemoryKvCache();
    await cache.set('a', '1', 60);
    await cache.set('b', '2', -1);
    expect(await cache.get('a')).toBe('1');
    expect(await cache.get('b')).toBeNull();
  });
});

describe('validateWidgetConfig', () => {
  const ctx = (weather?: string) =>
    ({
      env: { PUBLIC_URL: 'https://signage.example.com', WEATHER_API_URL: weather },
    }) as unknown as AppContext;
  const fields = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      if (error instanceof HttpError) return error.fields;
      throw error;
    }
    return null;
  };

  it('never allows framing the system itself', () => {
    expect(
      fields(() =>
        validateWidgetConfig(ctx(), 'webpage', { url: 'https://signage.example.com/api/v1/me' }),
      ),
    ).toEqual([{ path: 'config.url', reason: 'own_origin' }]);
    expect(validateWidgetConfig(ctx(), 'webpage', { url: 'https://example.org/menu' })).toEqual({
      url: 'https://example.org/menu',
      refreshMinutes: 0,
    });
  });

  it('requires the operator to enable weather', () => {
    const config = { latitude: 32, longitude: 34, locationName: 'TLV' };
    expect(fields(() => validateWidgetConfig(ctx(), 'weather', config))).toEqual([
      { path: 'type', reason: 'unavailable' },
    ]);
    expect(
      validateWidgetConfig(ctx('https://api.example/v1/forecast'), 'weather', config),
    ).toMatchObject({ units: 'metric', days: 3 });
  });
});
