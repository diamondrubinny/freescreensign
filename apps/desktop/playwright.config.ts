import { defineConfig } from '@playwright/test';

/** Launches the real Electron app (needs a display: run under xvfb-run on Linux CI). */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
});
