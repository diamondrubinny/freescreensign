import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  base: '/player/',
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
