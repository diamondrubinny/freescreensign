import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/** A stand-in Rubinny server: /player/ is a page that counts its loads. */
let server: Server;
let origin = '';
let loads = 0;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url?.startsWith('/player/')) {
      loads++;
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        '<!doctype html><html><head><title>Player</title></head>' +
          '<body style="margin:0;background:#1d4ed8"><h1 id="ok">player</h1></body></html>',
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

async function launch(env: Record<string, string>): Promise<ElectronApplication> {
  return electron.launch({
    // Root in CI containers needs --no-sandbox; the app itself never disables it.
    args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '.'],
    cwd: join(import.meta.dirname, '..'),
    // Xvfb has no GPU: like a VM without graphics, the app needs software rendering there.
    env: { ...process.env, RUBINNY_KIOSK: '0', RUBINNY_DISABLE_GPU: '1', ...env },
  });
}

test('shows the player with a native bridge that captures real screenshots', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'rubinny-e2e-'));
  const app = await launch({ RUBINNY_USER_DATA: userData, RUBINNY_SERVER_URL: origin });
  const page = await app.firstWindow();
  await expect(page.locator('#ok')).toHaveText('player');

  const bridge = await page.evaluate(() => {
    const native = (window as unknown as { RubinnyNative: Record<string, unknown> }).RubinnyNative;
    return { platform: native.platform, capabilities: native.capabilities };
  });
  expect(bridge).toEqual({ platform: 'electron', capabilities: ['screenshot'] });
  const jpeg = await page.evaluate(async () => {
    const native = (window as unknown as { RubinnyNative: { capture: () => Promise<Uint8Array> } })
      .RubinnyNative;
    return Array.from(await native.capture());
  });
  expect(jpeg.slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
  expect(jpeg.length).toBeGreaterThan(500);
  // Node and Electron internals are not reachable from the page.
  expect(
    await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
  ).toBe('undefined');
  expect(
    await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process),
  ).toBe('undefined');
  await app.close();
});

test('blocks other sites, pop-ups and permissions', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'rubinny-e2e-'));
  const app = await launch({ RUBINNY_USER_DATA: userData, RUBINNY_SERVER_URL: origin });
  const page = await app.firstWindow();
  await expect(page.locator('#ok')).toBeVisible();
  const start = page.url();
  await page.evaluate(() => {
    location.href = 'http://localhost:9/elsewhere';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(start);
  expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true);
  expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied');
  await app.close();
});

test('reloads the player after a renderer crash', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'rubinny-e2e-'));
  const app = await launch({ RUBINNY_USER_DATA: userData, RUBINNY_SERVER_URL: origin });
  const page = await app.firstWindow();
  await expect(page.locator('#ok')).toBeVisible();
  const before = loads;
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer();
  });
  await expect.poll(() => loads, { timeout: 15_000 }).toBeGreaterThan(before);
  await app.close();
});

test('asks for the server on first start, accepting only safe addresses', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'rubinny-e2e-'));
  const app = await launch({ RUBINNY_USER_DATA: userData });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Rubinny Player' })).toBeVisible();
  // The setup page gets no capture bridge.
  expect(await page.evaluate(() => 'RubinnyNative' in window)).toBe(false);

  await page.getByLabel(/כתובת השרת/).fill('http://evil.example');
  await page.getByRole('button', { name: /שמירה והתחלה/ }).click();
  await expect(page.getByRole('alert')).toContainText('כתובת לא תקינה');

  await page.getByLabel(/כתובת השרת/).fill(origin);
  await page.getByRole('button', { name: /שמירה והתחלה/ }).click();
  await expect(page.locator('#ok')).toHaveText('player');
  expect(JSON.parse(readFileSync(join(userData, 'config.json'), 'utf8'))).toEqual({
    serverOrigin: origin,
  });
  await app.close();
});
