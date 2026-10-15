import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running Rubinny stack (deploy/docker-compose.yml).
 *   E2E_BASE_URL     default https://localhost
 *   E2E_SETUP_TOKEN  SETUP_TOKEN from deploy/.env (fresh database required)
 *   PLAYWRIGHT_CHROMIUM_PATH  optional custom Chromium binary
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    locale: 'he-IL',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          // The local stack uses Caddy's self-signed certificate. Chrome refuses to
          // register service workers on untrusted certificates (even with
          // ignoreHTTPSErrors), which the offline player test needs. Test-only.
          args: ['--ignore-certificate-errors'],
        },
      },
    },
  ],
});
