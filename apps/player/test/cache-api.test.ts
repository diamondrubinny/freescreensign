import { describe, expect, it, vi } from 'vitest';
import { InvalidManifestError, PlayerApi, UnauthorizedError, type FetchLike } from '../src/api';
import { MediaCache, MemoryBlobStore } from '../src/media-cache';
import { manifest, sha256Hex } from './fixtures';

const bytes = new Uint8Array([1, 2, 3]);

describe('MediaCache', () => {
  it('downloads, verifies sha256, caches and reuses media', async () => {
    const sha = await sha256Hex(bytes);
    const download = vi.fn(() => Promise.resolve(new Blob([bytes])));
    const store = new MemoryBlobStore();
    const cache = new MediaCache(store, download);
    const item = { id: 'm1', mime: 'image/png' as const, sizeBytes: 3, sha256: sha };

    expect(await cache.sync([item])).toEqual({ failed: [] });
    expect(await cache.sync([item])).toEqual({ failed: [] });
    expect(download).toHaveBeenCalledTimes(1);
    expect(await cache.objectUrl(item)).toMatch(/^blob:/);
  });

  it('rejects files whose hash does not match (tampering / corruption)', async () => {
    const store = new MemoryBlobStore();
    const cache = new MediaCache(store, () => Promise.resolve(new Blob([bytes])));
    const item = { id: 'm1', mime: 'image/png' as const, sizeBytes: 3, sha256: 'f'.repeat(64) };
    expect(await cache.sync([item])).toEqual({ failed: ['m1'] });
    expect(store.map.size).toBe(0);
    expect(await cache.objectUrl(item)).toBeNull();
  });

  it('prunes media no longer referenced', async () => {
    const sha = await sha256Hex(bytes);
    const store = new MemoryBlobStore();
    const cache = new MediaCache(store, () => Promise.resolve(new Blob([bytes])));
    await cache.sync([{ id: 'old', mime: 'image/png', sizeBytes: 3, sha256: sha }]);
    await cache.sync([{ id: 'new', mime: 'image/png', sizeBytes: 3, sha256: sha }]);
    expect([...store.map.keys()]).toEqual([`/player-cache/media/new/${sha}`]);
  });

  it('propagates revocation instead of treating it as a download failure', async () => {
    const cache = new MediaCache(new MemoryBlobStore(), () =>
      Promise.reject(new UnauthorizedError()),
    );
    await expect(
      cache.sync([{ id: 'm', mime: 'image/png', sizeBytes: 1, sha256: 'a'.repeat(64) }]),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('PlayerApi', () => {
  const respond = (status: number, body?: unknown) =>
    vi.fn<FetchLike>(() =>
      Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
    );

  it('sends the bearer token and ETag, and maps 304 to null', async () => {
    const fetcher = respond(304);
    expect(await new PlayerApi(fetcher).manifest('tok', 'v1')).toBeNull();
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'if-none-match': '"v1"' });
    expect(init.credentials).toBe('omit');
  });

  it('validates manifests and rejects invalid ones', async () => {
    expect((await new PlayerApi(respond(200, manifest())).manifest('t', null))?.version).toBe('v1');
    const bad = {
      ...manifest(),
      media: [{ id: 'x', mime: 'text/html', sizeBytes: 1, sha256: 'z' }],
    };
    await expect(new PlayerApi(respond(200, bad)).manifest('t', null)).rejects.toBeInstanceOf(
      InvalidManifestError,
    );
  });

  it('maps 401 to UnauthorizedError', async () => {
    await expect(new PlayerApi(respond(401, {})).manifest('t', null)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(new PlayerApi(respond(401, {})).media('t', 'm')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
