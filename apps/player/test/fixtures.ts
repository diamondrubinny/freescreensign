// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ManifestV1 } from '@rubinny/shared';

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function manifest(overrides: Partial<ManifestV1> = {}): ManifestV1 {
  return {
    schemaVersion: 1,
    version: 'v1',
    generatedAt: '2026-10-15T10:00:00Z',
    screen: { id: 's1', name: 'Lobby', timezone: 'Asia/Jerusalem', orientation: 'landscape' },
    media: [
      { id: 'm1', mime: 'image/png', sizeBytes: 3, sha256: 'a'.repeat(64) },
      { id: 'm2', mime: 'video/mp4', sizeBytes: 3, sha256: 'b'.repeat(64), durationMs: 5000 },
    ],
    widgets: [],
    playlists: [
      {
        id: 'p1',
        items: [
          { kind: 'media', ref: 'm1', durationMs: 10000, transition: 'fade' },
          { kind: 'media', ref: 'm2', durationMs: 5000, transition: 'fade' },
        ],
      },
    ],
    layouts: [
      {
        id: 'default',
        width: 1920,
        height: 1080,
        zones: [{ id: 'main', x: 0, y: 0, w: 1920, h: 1080, z: 0, playlistId: 'p1' }],
      },
    ],
    schedule: { defaultLayoutId: 'default', entries: [] },
    ...overrides,
  };
}
