// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Settings kept in the user's config folder (only the server address). */
export interface DesktopConfig {
  /** Origin of the Rubinny server, e.g. "https://signage.example.com". */
  serverOrigin: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates a server address typed by an installer. https is required, except for
 * http on this machine (development). Returns the origin, or null if not acceptable.
 */
export function parseServerUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

/** The player page of a server. */
export const playerUrl = (origin: string) => `${origin}/player/`;

export function configPath(userData: string): string {
  return join(userData, 'config.json');
}

export function loadConfig(userData: string): DesktopConfig | null {
  try {
    const raw = JSON.parse(readFileSync(configPath(userData), 'utf8')) as {
      serverOrigin?: unknown;
    };
    const origin = typeof raw.serverOrigin === 'string' ? parseServerUrl(raw.serverOrigin) : null;
    return origin ? { serverOrigin: origin } : null;
  } catch {
    return null;
  }
}

/** Writes atomically (temp file + rename), readable only by the current user. */
export function saveConfig(userData: string, config: DesktopConfig): void {
  const path = configPath(userData);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
  renameSync(temp, path);
}
