/**
 * The few built-ins the player and its libraries use that Chromium 69 lacks (Samsung
 * screens of 2020, LG webOS Signage 6; see docs/phases/14-tizen-webos.md). Imported first,
 * before any library runs. Syntax is lowered by the build (target chrome69).
 */

// Chromium 71.
if (typeof globalThis === 'undefined') {
  Object.defineProperty(self, 'globalThis', { value: self, configurable: true, writable: true });
}

// Chromium 73.
if (typeof Object.fromEntries !== 'function') {
  Object.defineProperty(Object, 'fromEntries', {
    configurable: true,
    writable: true,
    value: (entries: Iterable<readonly [PropertyKey, unknown]>) => {
      const result: Record<PropertyKey, unknown> = {};
      for (const [key, value] of entries) result[key] = value;
      return result;
    },
  });
}

export {};
