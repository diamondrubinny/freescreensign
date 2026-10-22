// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  manifestAlertSchema,
  parseManifest,
  type ManifestAlert,
  type ManifestV1,
} from '@rubinny/shared';

/**
 * Persistent player state. localStorage can be unavailable (e.g. blocked site
 * data); the player then still works for the current session.
 */
const TOKEN_KEY = 'rubinny.player.token';
const MANIFEST_KEY = 'rubinny.player.manifest';
const WIDGET_DATA_PREFIX = 'rubinny.player.widget-data.';
const CLOCK_OFFSET_KEY = 'rubinny.player.clock-offset';
const ALERT_KEY = 'rubinny.player.alert';

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
  /** The current alert, kept apart from the manifest: it is shown before media is ready. */
  alert(): ManifestAlert | null {
    const raw = read(ALERT_KEY);
    if (!raw) return null;
    try {
      const result = manifestAlertSchema.safeParse(JSON.parse(raw));
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  },
  setAlert: (alert: ManifestAlert | null) => {
    write(ALERT_KEY, alert ? JSON.stringify(alert) : null);
  },
  /** Device clock minus server clock (ms), kept for offline restarts. */
  clockOffset(): number {
    const value = Number(read(CLOCK_OFFSET_KEY));
    return Number.isFinite(value) ? value : 0;
  },
  setClockOffset: (offsetMs: number) => {
    write(CLOCK_OFFSET_KEY, String(Math.round(offsetMs)));
  },
  /** Last known server data of a widget (RSS, weather), for offline playback. */
  widgetData(widgetId: string): unknown {
    const raw = read(WIDGET_DATA_PREFIX + widgetId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  },
  setWidgetData: (widgetId: string, data: unknown) => {
    write(WIDGET_DATA_PREFIX + widgetId, JSON.stringify(data));
  },
  /** Removes stored data of widgets no longer in the manifest. */
  pruneWidgetData(keep: readonly string[]) {
    const wanted = new Set(keep.map((id) => WIDGET_DATA_PREFIX + id));
    try {
      const stale: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(WIDGET_DATA_PREFIX) && !wanted.has(key)) stale.push(key);
      }
      for (const key of stale) localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
  clear() {
    write(TOKEN_KEY, null);
    write(MANIFEST_KEY, null);
    write(CLOCK_OFFSET_KEY, null);
    write(ALERT_KEY, null);
    this.pruneWidgetData([]);
  },
};
