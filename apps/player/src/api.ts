import { parseManifest, type ManifestV1 } from '@rubinny/shared';

export class UnauthorizedError extends Error {
  constructor() {
    super('Device token rejected');
    this.name = 'UnauthorizedError';
  }
}

export class PairingExpiredError extends Error {
  constructor() {
    super('Pairing code expired');
    this.name = 'PairingExpiredError';
  }
}

export class InvalidManifestError extends Error {
  constructor(readonly issues: string[]) {
    super('Invalid manifest');
    this.name = 'InvalidManifestError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** HTTP client for the player API. The device token is sent as a Bearer token (no cookies). */
export class PlayerApi {
  constructor(
    private readonly fetcher: FetchLike = (input, init) => fetch(input, init),
    private readonly base = '/player/v1',
  ) {}

  async pairStart(): Promise<{ code: string; pollToken: string; expiresIn: number }> {
    const res = await this.fetcher(`${this.base}/pair/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`pair/start failed: ${String(res.status)}`);
    return (await res.json()) as { code: string; pollToken: string; expiresIn: number };
  }

  async pairStatus(
    pollToken: string,
  ): Promise<{ status: 'pending' } | { status: 'paired'; deviceToken: string }> {
    const res = await this.fetcher(`${this.base}/pair/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pollToken }),
      credentials: 'omit',
    });
    if (res.status === 404) throw new PairingExpiredError();
    if (!res.ok) throw new Error(`pair/status failed: ${String(res.status)}`);
    return (await res.json()) as { status: 'pending' } | { status: 'paired'; deviceToken: string };
  }

  /** Returns null when unchanged (304). */
  async manifest(token: string, etag: string | null): Promise<ManifestV1 | null> {
    const res = await this.fetcher(`${this.base}/manifest`, {
      headers: {
        authorization: `Bearer ${token}`,
        ...(etag ? { 'if-none-match': `"${etag}"` } : {}),
      },
      credentials: 'omit',
      cache: 'no-store',
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (res.status === 304) return null;
    if (!res.ok) throw new Error(`manifest failed: ${String(res.status)}`);
    const result = parseManifest(await res.json());
    if (!result.success)
      throw new InvalidManifestError(result.issues.map((i) => `${i.path}: ${i.message}`));
    return result.manifest;
  }

  async media(token: string, mediaId: string): Promise<Blob> {
    const res = await this.fetcher(`${this.base}/media/${encodeURIComponent(mediaId)}`, {
      headers: { authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(`media ${mediaId} failed: ${String(res.status)}`);
    return res.blob();
  }

  async heartbeat(
    token: string,
    body: { manifestVersion: string | null; playerVersion: string; resolution: string },
  ): Promise<void> {
    const res = await this.fetcher(`${this.base}/heartbeat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    });
    if (res.status === 401) throw new UnauthorizedError();
  }
}
