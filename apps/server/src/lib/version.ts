// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { readFileSync } from 'node:fs';

/** Version of this server, from its package.json (read once). */
export const SERVER_VERSION = (() => {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

const parts = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** True when `version` is an older x.y.z release than `than`; false for anything else. */
export function isOlderVersion(version: string, than: string): boolean {
  const a = parts(version);
  const b = parts(than);
  if (!a || !b) return false;
  for (const [index, part] of a.entries()) {
    const other = b[index] ?? 0;
    if (part !== other) return part < other;
  }
  return false;
}
