// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { attributionBundlePlugin } from '@rubinny/shared';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  base: '/player/',
  plugins: [attributionBundlePlugin()],
  define: { __PLAYER_VERSION__: JSON.stringify(version) },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/player/v1': { target: 'http://127.0.0.1:3000', ws: true } },
  },
  build: {
    target: 'chrome69',
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
