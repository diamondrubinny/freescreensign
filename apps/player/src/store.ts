import { parseManifest, type ManifestV1 } from '@rubinny/shared';

/**
 * Persistent player state. localStorage can be unavailable (e.g. blocked site
 * data); the player then still works for the current session.
 */
const TOKEN_KEY = 'rubinny.player.token';
const MANIFEST_KEY = 'rubinny.player.manifest';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const store = {
  token: () => read(TOKEN_KEY),
  setToken: (token: string | null) => {
    write(TOKEN_KEY, token);
  },
  manifest(): ManifestV1 | null {
    const raw = read(MANIFEST_KEY);
    if (!raw) return null;
    try {
      const result = parseManifest(JSON.parse(raw));
      return result.success ? result.manifest : null;
    } catch {
      return null;
    }
  },
  setManifest: (manifest: ManifestV1 | null) => {
    write(MANIFEST_KEY, manifest ? JSON.stringify(manifest) : null);
  },
  clear() {
    write(TOKEN_KEY, null);
    write(MANIFEST_KEY, null);
  },
};
