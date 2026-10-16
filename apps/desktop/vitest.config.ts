import { defineConfig } from 'vitest/config';

// Unit tests only; e2e/ launches Electron through Playwright (pnpm e2e).
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
