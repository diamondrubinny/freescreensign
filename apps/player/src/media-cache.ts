import type { ManifestMedia } from '@rubinny/shared';

/** Storage backend for media blobs (Cache Storage in browsers, in-memory in tests). */
export interface BlobStore {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  keys(): Promise<string[]>;
  delete(key: string): Promise<void>;
}

const CACHE_NAME = 'rubinny-player-media-v1';
const PREFIX = '/player-cache/media/';

export class CacheStorageBlobStore implements BlobStore {
  async get(key: string) {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(key);
    return response ? response.blob() : null;
  }
  async put(key: string, blob: Blob) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, new Response(blob, { headers: { 'content-type': blob.type } }));
  }
  async keys() {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  }
  async delete(key: string) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(key);
  }
}

export class MemoryBlobStore implements BlobStore {
  readonly map = new Map<string, Blob>();
  get(key: string) {
    return Promise.resolve(this.map.get(key) ?? null);
  }
  put(key: string, blob: Blob) {
    this.map.set(key, blob);
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.map.keys()]);
  }
  delete(key: string) {
    this.map.delete(key);
    return Promise.resolve();
  }
}

export class IntegrityError extends Error {
  constructor(readonly mediaId: string) {
    super(`Integrity check failed for media ${mediaId}`);
    this.name = 'IntegrityError';
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const keyFor = (media: ManifestMedia) => `${PREFIX}${media.id}/${media.sha256}`;

/**
 * Keeps the media referenced by the manifest available offline. Downloads are
 * verified against the manifest's sha256 before they are stored or played.
 */
export class MediaCache {
  readonly #urls = new Map<string, string>();

  constructor(
    private readonly store: BlobStore,
    private readonly download: (mediaId: string) => Promise<Blob>,
  ) {}

  /** Ensures all items are cached; returns ids that could not be made available. */
  async sync(media: readonly ManifestMedia[]): Promise<{ failed: string[] }> {
    const failed: string[] = [];
    for (const item of media) {
      try {
        if (await this.store.get(keyFor(item))) continue;
        const blob = await this.download(item.id);
        if ((await sha256Hex(blob)) !== item.sha256) throw new IntegrityError(item.id);
        await this.store.put(keyFor(item), new Blob([blob], { type: item.mime }));
      } catch (error) {
        if ((error as Error).name === 'UnauthorizedError') throw error;
        failed.push(item.id);
      }
    }
    await this.prune(media);
    return { failed };
  }

  /** Object URL for a cached item, or null if unavailable. */
  async objectUrl(item: ManifestMedia): Promise<string | null> {
    const key = keyFor(item);
    const existing = this.#urls.get(key);
    if (existing) return existing;
    const blob = await this.store.get(key);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.#urls.set(key, url);
    return url;
  }

  /** Deletes cached files that the current manifest no longer references. */
  async prune(media: readonly ManifestMedia[]): Promise<void> {
    const keep = new Set(media.map(keyFor));
    for (const key of await this.store.keys()) {
      if (!key.startsWith(PREFIX) || keep.has(key)) continue;
      await this.store.delete(key);
      const url = this.#urls.get(key);
      if (url) URL.revokeObjectURL(url);
      this.#urls.delete(key);
    }
  }

  async clear(): Promise<void> {
    await this.prune([]);
  }
}
