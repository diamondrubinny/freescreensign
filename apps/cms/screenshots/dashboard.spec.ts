// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { totp } from '../e2e/helpers';

/**
 * Pictures of the dashboard for the READMEs, against a running stack with an EMPTY database
 * (deploy/e2e-reset.sh): it sets up a demo organization with starter kits, two screens playing
 * them and a weekly schedule, then captures each page. Hebrew pictures are written as
 * docs/screenshots/cms-<page>.png, English ones as cms-<page>-en.png.
 *
 *   SCREENS_LOCALE=he|en  E2E_SETUP_TOKEN=…  pnpm --filter @rubinny/cms screens
 */
const LOCALE = process.env.SCREENS_LOCALE === 'en' ? 'en' : 'he';
const SETUP_TOKEN = process.env.E2E_SETUP_TOKEN ?? '';
const OUT = new URL('../../../docs/screenshots/', import.meta.url).pathname;
const file = (name: string) => `${OUT}cms-${name}${LOCALE === 'en' ? '-en' : ''}.png`;

const DEMO = {
  he: {
    name: 'דנה כהן',
    org: 'רשת הגפן',
    screens: ['מסעדה — כניסה', 'קולנוע — לובי'],
    schedule: 'שבוע רגיל',
    entries: ['בוקר בבית הקפה', 'צהריים וערב במסעדה', 'סוף שבוע בקולנוע'],
    menu: 'תפריט המסעדה',
    design: 'מנת היום',
  },
  en: {
    name: 'Dana Cohen',
    org: 'Vine Group',
    screens: ['Restaurant — entrance', 'Cinema — lobby'],
    schedule: 'Regular week',
    entries: ['Café mornings', 'Restaurant lunch and dinner', 'Cinema weekends'],
    menu: 'Restaurant menu',
    design: 'Dish of the day',
  },
}[LOCALE];
const ADMIN = { email: 'dana@example.com', password: 'purple elephants dance at midnight' };

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 960 }, locale: LOCALE === 'en' ? 'en-US' : 'he-IL' });

let orgId = '';
const ids: Record<string, string> = {};

async function json<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/** The locale before the app loads (the language switcher stores it the same way). */
async function prepare(page: Page) {
  await page.addInitScript((locale) => {
    window.localStorage.setItem('rubinny.locale', locale);
  }, LOCALE);
}

/** Pairs a new "screen" (a browser context running the player) and returns its id. */
async function pairScreen(browser: Browser, page: Page, name: string, layoutId: string) {
  const device = await browser.newContext({ ignoreHTTPSErrors: true });
  const player = await device.newPage();
  await player.goto('/player/');
  const code = (await player.getByTestId('pairing-code').textContent({ timeout: 20_000 }))?.trim();
  const created = await json<{ screen: { id: string } }>(
    await page.request.post(`/api/v1/orgs/${orgId}/screens`, {
      data: { code, name, layoutId },
    }),
  );
  return created.screen.id;
}

test('a demo organization, and pictures of its dashboard', async ({ page, browser }) => {
  test.setTimeout(420_000);
  expect(SETUP_TOKEN, 'E2E_SETUP_TOKEN must be set').not.toBe('');
  await prepare(page);
  await page.goto('/login');

  await json(
    await page.request.post('/api/v1/setup', {
      data: {
        setupToken: SETUP_TOKEN,
        email: ADMIN.email,
        password: ADMIN.password,
        name: DEMO.name,
        orgName: DEMO.org,
        locale: LOCALE,
      },
    }),
  );
  // Two-step verification, which admin pages need.
  const { secret } = await json<{ secret: string }>(
    await page.request.post('/api/v1/auth/mfa/totp/setup', {
      data: { password: ADMIN.password },
    }),
  );
  await json(
    await page.request.post('/api/v1/auth/mfa/totp/enable', { data: { code: totp(secret) } }),
  );
  const session = await json<{ memberships: { orgId: string }[] }>(
    await page.request.get('/api/v1/auth/session'),
  );
  orgId = session.memberships[0]!.orgId;

  for (const kit of ['restaurant', 'cinema', 'cafe', 'retail']) {
    const { layout } = await json<{ layout: { id: string } }>(
      await page.request.post(`/api/v1/orgs/${orgId}/starter-kits/${kit}`, {
        data: { locale: LOCALE },
      }),
    );
    ids[kit] = layout.id;
  }

  ids.screen = await pairScreen(browser, page, DEMO.screens[0]!, ids.restaurant!);
  await pairScreen(browser, page, DEMO.screens[1]!, ids.cinema!);

  const { schedule } = await json<{ schedule: { id: string } }>(
    await page.request.post(`/api/v1/orgs/${orgId}/schedules`, {
      data: {
        name: DEMO.schedule,
        entries: [
          {
            name: DEMO.entries[0],
            layoutId: ids.cafe,
            daysOfWeek: [0, 1, 2, 3, 4],
            timeFrom: '07:00',
            timeTo: '11:00',
          },
          {
            name: DEMO.entries[1],
            layoutId: ids.restaurant,
            timeFrom: '11:00',
            timeTo: '23:00',
          },
          { name: DEMO.entries[2], layoutId: ids.cinema, daysOfWeek: [5, 6] },
        ],
      },
    }),
  );
  ids.schedule = schedule.id;

  const { widgets } = await json<{ widgets: { id: string; name: string }[] }>(
    await page.request.get(`/api/v1/orgs/${orgId}/widgets`),
  );
  // The restaurant's menu and dish of the day.
  ids.menu = widgets.find((w) => w.name === DEMO.menu)!.id;
  ids.design = widgets.find((w) => w.name === DEMO.design)!.id;

  // Let the screens play for a while: uptime, "now playing" and plays for the report.
  await page.waitForTimeout(80_000);
  await capture(page);
});

const PAGES: [name: string, path: () => string][] = [
  ['dashboard', () => '/'],
  ['layouts', () => `/orgs/${orgId}/layouts`],
  ['widgets', () => `/orgs/${orgId}/widgets`],
  ['designer', () => `/orgs/${orgId}/widgets/${ids.design}`],
  ['menu-editor', () => `/orgs/${orgId}/widgets/${ids.menu}`],
  ['screen-status', () => `/orgs/${orgId}/screens/${ids.screen}`],
  ['reports', () => `/orgs/${orgId}/reports`],
  ['schedule', () => `/orgs/${orgId}/schedules/${ids.schedule}`],
  ['about', () => '/about'],
];

/** Opens a page and waits until it has settled (data loaded, images decoded, fonts ready). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Progress bars, skeletons and transitions.
  await page.waitForTimeout(800);
}

async function capture(page: Page) {
  for (const [name, path] of PAGES) {
    await open(page, path());
    await page.screenshot({ path: file(name) });
  }

  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, '/');
  await page.screenshot({ path: file('dashboard-dark') });
  await page.emulateMedia({ colorScheme: 'light' });

  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/');
  await page.getByRole('button', { name: LOCALE === 'en' ? 'Menu' : 'תפריט', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: file('mobile') });
}
