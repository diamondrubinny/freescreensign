/**
 * localStorage wrapper for non-essential, per-browser preferences (language,
 * accessibility). Storage can be unavailable (private mode, blocked site data),
 * so every access is guarded and the app works without it.
 */
const PREFIX = 'rubinny.';

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore: preferences are a convenience only.
  }
}

export function clearPreferences(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore.
  }
}
