// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { readFile } from 'node:fs/promises';
import { expect, request, test, type Browser, type Page } from '@playwright/test';
import { expectAccessible, totp } from './helpers';

const SETUP_TOKEN = process.env.E2E_SETUP_TOKEN ?? '';
const ADMIN = {
  name: 'דנה מנהלת',
  email: 'dana@example.com',
  password: 'purple elephants dance at midnight',
};
const TEACHER = {
  name: 'יוסי מורה',
  email: 'yossi@example.com',
  password: 'green turtles sing in the rain',
};

let mfaSecret = '';
let inviteUrl = '';
let lastStep = 0;

/**
 * A TOTP code the server has not seen yet. Each 30 s time step can be used once
 * (replay protection), so wait for the next step when the current one is spent.
 */
async function nextCode(): Promise<string> {
  for (;;) {
    const step = Math.floor(Date.now() / 1000 / 30);
    if (step > lastStep) {
      lastStep = step;
      return totp(mfaSecret);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function signIn(page: Page, user: { email: string; password: string }, withMfa: boolean) {
  await page.goto('/login');
  await page.getByLabel('אימייל').fill(user.email);
  await page.getByLabel('סיסמה', { exact: false }).fill(user.password);
  await page.getByRole('button', { name: 'התחברות' }).click();
  if (withMfa) {
    await expect(page.getByRole('heading', { level: 1, name: 'אימות דו-שלבי' })).toBeVisible();
    await page.getByLabel(/קוד אימות/).fill(await nextCode());
    await page.getByRole('button', { name: 'אימות' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'לוח בקרה' })).toBeVisible();
}

/** The main navigation (the dashboard also links to the same pages). */
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'ניווט ראשי' });

/**
 * Opens a page from the main navigation and waits for its heading, so that typing or an
 * accessibility check never hits the previous page (some share field labels).
 */
async function openPage(page: Page, link: string, heading = link) {
  await mainNav(page).getByRole('link', { name: link, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('first-run setup creates the administrator (RTL, accessible)', async ({ page }) => {
  expect(SETUP_TOKEN, 'E2E_SETUP_TOKEN must be set').not.toBe('');
  await page.goto('/login');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByTestId('powered-by')).toContainText('מופעל על ידי Rubinny · קוד פתוח');
  await expect(page.getByTestId('created-by')).toHaveText('נוצר על ידי Diamond Rubinny');
  await expectAccessible(page, 'setup');

  await page.getByLabel(/קוד הגדרה/).fill(SETUP_TOKEN);
  await page.getByLabel('שם מלא').fill(ADMIN.name);
  await page.getByLabel('אימייל').fill(ADMIN.email);
  await page.getByLabel('סיסמה').fill('short');
  await page.getByLabel('שם הארגון').fill('בית ספר הדגמה');
  await page.getByRole('button', { name: 'יצירת חשבון וארגון' }).click();
  // Server-side validation is shown next to the field and focus moves there.
  await expect(page.getByText('הסיסמה קצרה מדי (לפחות 10 תווים).')).toBeVisible();
  await expect(page.getByLabel('סיסמה')).toBeFocused();

  await page.getByLabel('סיסמה').fill(ADMIN.password);
  await page.getByRole('button', { name: 'יצירת חשבון וארגון' }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByRole('heading', { level: 1, name: 'החשבון שלי' })).toBeFocused();
});

test('admin actions require MFA; enabling MFA unlocks them', async ({ page }) => {
  await signIn(page, ADMIN, false);
  await expect(page.getByText('החשבון שלך אינו מוגן באימות דו-שלבי.')).toBeVisible();
  await expectAccessible(page, 'dashboard');

  await mainNav(page).getByRole('link', { name: 'חברים', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('יש להפעיל אימות דו-שלבי');

  await mainNav(page).getByRole('link', { name: 'החשבון שלי', exact: true }).click();
  await expectAccessible(page, 'account');
  await page.locator('#mfa-heading ~ form').getByLabel('סיסמה נוכחית').fill(ADMIN.password);
  await page.getByRole('button', { name: 'הפעלת אימות דו-שלבי' }).click();
  await expect(page.getByRole('img', { name: /קוד QR/ })).toBeVisible();
  mfaSecret = (await page.getByTestId('mfa-secret').textContent())?.trim() ?? '';
  expect(mfaSecret).toMatch(/^[A-Z2-7]{32}$/);
  await expectAccessible(page, 'account (MFA setup)');
  await page.getByLabel(/קוד אימות/).fill(await nextCode());
  await page.getByRole('button', { name: 'אישור והפעלה' }).click();
  await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
  await page.getByRole('button', { name: 'שמרתי את הקודים' }).click();
  await expect(page.getByText('אימות דו-שלבי פעיל.')).toBeVisible();

  await mainNav(page).getByRole('link', { name: 'חברים', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'חברי הארגון' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: new RegExp(ADMIN.name) })).toBeVisible();
});

test('admin uploads, previews and deletes media; disguised files are rejected', async ({
  page,
}) => {
  // 1×1 PNG.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await signIn(page, ADMIN, true);
  await openPage(page, 'מדיה', 'ספריית מדיה');
  await expect(page.getByRole('heading', { level: 1, name: 'ספריית מדיה' })).toBeVisible();
  await expect(page.getByText('אין עדיין קבצים בספרייה.')).toBeVisible();
  await expectAccessible(page, 'media (empty)');

  const input = page.getByLabel('בחירת קבצים להעלאה');
  await input.setInputFiles([
    { name: 'לוגו בית הספר.png', mimeType: 'image/png', buffer: pngBytes },
    {
      name: 'not-really.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ this is not an image'),
    },
  ]);
  const uploadRegion = page.getByRole('region', { name: 'העלאת קבצים' });
  await expect(uploadRegion.getByRole('listitem').filter({ hasText: 'not-really.png' })).toHaveText(
    'העלאת not-really.png נכשלה: סוג הקובץ אינו נתמך.',
  );

  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'לוגו בית הספר' }) });
  await expect(card.getByText('מוכן')).toBeVisible({ timeout: 30_000 });
  // Decorative thumbnail (alt=""): check it really loaded through auth + CSP.
  const thumb = card.locator('img');
  await expect(thumb).toBeVisible();
  await expect
    .poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expectAccessible(page, 'media (with items)');

  await card.getByRole('button', { name: /תצוגה מקדימה/ }).click();
  const preview = page.getByRole('dialog', { name: 'לוגו בית הספר' });
  await expect(preview.getByRole('img', { name: 'לוגו בית הספר' })).toBeVisible();
  await expectAccessible(page, 'media preview');
  await page.keyboard.press('Escape');

  await page.getByRole('searchbox', { name: 'חיפוש לפי שם' }).fill('לא קיים');
  await expect(page.getByText('לא נמצאו קבצים מתאימים.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'חיפוש לפי שם' }).fill('');

  await card.getByRole('button', { name: /מחיקה/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.getByText('אין עדיין קבצים בספרייה.')).toBeVisible();
});

test('a screen pairs with a code, plays a playlist and updates live', async ({ page, browser }) => {
  // 4×4 red PNG (generated with sharp).
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWO4o6YGRwzEcQDsoxKBowvaFAAAAABJRU5ErkJggg==',
    'base64',
  );
  await signIn(page, ADMIN, true);

  // Media + playlist.
  await openPage(page, 'מדיה', 'ספריית מדיה');
  await page
    .getByLabel('בחירת קבצים להעלאה')
    .setInputFiles([{ name: 'מבצע השבוע.png', mimeType: 'image/png', buffer: pngBytes }]);
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'מבצע השבוע' }) });
  await expect(card.getByText('מוכן')).toBeVisible({ timeout: 30_000 });

  await openPage(page, 'פלייליסטים');
  await expectAccessible(page, 'playlists');
  await page.getByLabel('שם הפלייליסט').fill('לובי');
  await page.getByRole('button', { name: 'פלייליסט חדש' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /עריכת פלייליסט: לובי/ })).toBeVisible();
  await page.getByRole('button', { name: 'הוספה מבצע השבוע' }).click();
  await page.getByLabel('משך בשניות עבור מבצע השבוע').fill('5');
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(page.getByText('הפלייליסט נשמר והמסכים עודכנו.')).toBeVisible();
  await expectAccessible(page, 'playlist editor');

  // The player runs in its own browser context (like a separate device).
  const device = await browser.newContext({ ignoreHTTPSErrors: true });
  const player = await device.newPage();
  await player.goto('/player/');
  const codeText = await player.getByTestId('pairing-code').textContent({ timeout: 15_000 });
  // The attribution on the pairing screen (never over the customer's content).
  await expect(player.getByTestId('attribution')).toContainText('Powered by Rubinny · Open source');
  const code = codeText?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

  await openPage(page, 'מסכים');
  await expectAccessible(page, 'screens');
  const addForm = page.getByRole('form', { name: 'הוספת מסך' });
  await addForm.getByLabel('קוד חיבור').fill(code.toLowerCase().replace('-', ''));
  await addForm.getByLabel('שם מלא').fill('מסך כניסה');
  await addForm.getByLabel('פלייליסט').selectOption({ label: 'לובי' });
  await addForm.getByRole('button', { name: 'הוספת מסך' }).click();
  await expect(page.getByText('המסך חובר בהצלחה.')).toBeVisible();

  // The device receives its token, downloads and verifies the media, and plays it.
  const shown = player.locator('.layer img');
  await expect(shown).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(4);
  await expect(page.getByRole('row', { name: /מסך כניסה/ }).getByText('מחובר')).toBeVisible({
    timeout: 20_000,
  });

  // Offline-first: with the network gone, a reboot (reload) still plays from the
  // service-worker shell, the stored manifest and the verified media cache.
  await player.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await device.setOffline(true);
  await player.reload();
  await expect(player.locator('.layer img')).toBeVisible({ timeout: 20_000 });
  await device.setOffline(false);
  await player.reload(); // reconnect (fresh WebSocket)
  await expect(player.locator('.layer img')).toBeVisible({ timeout: 20_000 });

  // Live update: emptying the playlist reaches the screen over WebSocket.
  await openPage(page, 'פלייליסטים');
  await page.getByRole('link', { name: /עריכה לובי/ }).click();
  await page.getByRole('button', { name: 'הסרת מבצע השבוע' }).click();
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(player.getByText('אין תוכן להצגה · Nothing to show')).toBeVisible({
    timeout: 15_000,
  });

  // Disconnecting the screen sends the device back to pairing.
  await openPage(page, 'מסכים');
  await page.getByRole('button', { name: /ניתוק המסך מסך כניסה/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ניתוק המסך' }).click();
  await expect(player.getByTestId('pairing-code')).toBeVisible({ timeout: 15_000 });
  await device.close();
});

test('a layout shows a clock and a ticker side by side on a screen', async ({ page, browser }) => {
  const cmsCspViolations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cmsCspViolations.push(message.text());
  });
  await signIn(page, ADMIN, true);

  // Widgets.
  await openPage(page, 'Widgets');
  await expectAccessible(page, 'widgets');
  await page.getByRole('link', { name: 'בחירה שעון ותאריך' }).click();
  await page.getByLabel('שם ה-Widget').fill('שעון');
  await page.getByRole('button', { name: 'Widget חדש' }).click();
  await expect(page.getByText('ה-Widget נשמר והמסכים עודכנו.')).toBeVisible();
  await expectAccessible(page, 'widget editor (clock)');

  // A data table from a published Google Sheet: the form is saved and accessible.
  await page.getByRole('link', { name: 'חזרה לרשימת ה-Widgets' }).click();
  await page.getByRole('link', { name: 'בחירה טבלת נתונים' }).click();
  await page.getByLabel('שם ה-Widget').fill('תפריט');
  await page
    .getByLabel('כתובת הנתונים')
    .fill('https://docs.google.com/spreadsheets/d/e/2PACX-example/pub?output=csv');
  await page.getByLabel(/^עמודות להצגה/).fill('מנה, מחיר');
  await page.getByRole('button', { name: 'Widget חדש' }).click();
  await expect(page.getByText('ה-Widget נשמר והמסכים עודכנו.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'טעינת תצוגה מקדימה' })).toBeVisible();
  await expectAccessible(page, 'widget editor (table)');

  await page.getByRole('link', { name: 'חזרה לרשימת ה-Widgets' }).click();
  await page.getByRole('link', { name: 'בחירה טקסט רץ' }).click();
  await page.getByLabel('שם ה-Widget').fill('הודעות');
  await page.getByLabel(/^טקסט/).fill('ברוכים הבאים לבית הספר');
  await page.getByRole('button', { name: 'Widget חדש' }).click();
  await expect(page.getByText('ה-Widget נשמר והמסכים עודכנו.')).toBeVisible();

  // One playlist per zone.
  for (const [playlist, widget] of [
    ['שעון', 'שעון'],
    ['פס הודעות', 'הודעות'],
  ] as const) {
    await openPage(page, 'פלייליסטים');
    await page.getByLabel('שם הפלייליסט').fill(playlist);
    await page.getByRole('button', { name: 'פלייליסט חדש' }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(playlist) })).toBeVisible();
    await page
      .getByRole('region', { name: 'הוספת Widget' })
      .getByRole('button', { name: `הוספה ${widget}` })
      .click();
    await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
    await expect(page.getByText('הפלייליסט נשמר והמסכים עודכנו.')).toBeVisible();
  }

  // Layout "main + ticker".
  await openPage(page, 'תבניות תצוגה');
  await expectAccessible(page, 'layouts');
  await page.getByLabel('שם התבנית').fill('לובי ראשי');
  await page.getByRole('button', { name: 'תבנית חדשה' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /עריכת תבנית: לובי ראשי/ }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: /אזור 1/ })
    .getByLabel('פלייליסט')
    .selectOption({ label: 'שעון' });
  await page
    .getByRole('group', { name: /אזור 2/ })
    .getByLabel('פלייליסט')
    .selectOption({ label: 'פס הודעות' });
  await page.getByRole('button', { name: 'שמירת התבנית' }).click();
  await expect(page.getByText('התבנית נשמרה והמסכים עודכנו.')).toBeVisible();
  await expectAccessible(page, 'layout editor');

  // Pair a screen and assign the layout.
  const device = await browser.newContext({ ignoreHTTPSErrors: true });
  const player = await device.newPage();
  // Widgets must work under the player's strict Content Security Policy.
  const cspViolations: string[] = [];
  player.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
  });
  await player.goto('/player/');
  const code = (await player.getByTestId('pairing-code').textContent({ timeout: 15_000 }))?.trim();
  await openPage(page, 'מסכים');
  const addForm = page.getByRole('form', { name: 'הוספת מסך' });
  await addForm.getByLabel('קוד חיבור').fill(code ?? '');
  await addForm.getByLabel('שם מלא').fill('מסך לובי');
  await addForm.getByRole('button', { name: 'הוספת מסך' }).click();
  await expect(page.getByText('המסך חובר בהצלחה.')).toBeVisible();
  await page.getByRole('button', { name: 'עריכה מסך לובי' }).click();
  const dialog = page.getByRole('dialog', { name: 'עריכת מסך' });
  await dialog.getByLabel('תבנית תצוגה').selectOption({ label: 'לובי ראשי' });
  await expectAccessible(page, 'screen edit dialog');
  await dialog.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('row', { name: /מסך לובי/ })).toContainText('תבנית: לובי ראשי');

  // Both zones play at once: the clock (with the Hebrew date) and the RTL ticker.
  await expect(player.locator('.w-clock-time')).toHaveText(/^\d{2}:\d{2}$/, { timeout: 20_000 });
  await expect(player.locator('.w-clock-hebrew')).toHaveText(/^[\u05D0-\u05EA׳״ ]+$/);
  const ticker = player.locator('.w-ticker');
  await expect(ticker).toHaveAttribute('dir', 'rtl');
  await expect(ticker).toContainText('ברוכים הבאים לבית הספר');
  // The scrolling text enters the zone right away (regression: RTL text used to stay
  // off-screen for several seconds per loop).
  await expect
    .poll(
      () =>
        ticker.evaluate((root) => {
          const box = root.getBoundingClientRect();
          const text = root.querySelector('.w-ticker-text')!.getBoundingClientRect();
          return text.right > box.left && text.left < box.right;
        }),
      { timeout: 2_000, intervals: [100] },
    )
    .toBe(true);
  const zones = await player.locator('.zone').evaluateAll((elements) =>
    elements.map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.top), height: Math.round(rect.height) };
    }),
  );
  expect(zones).toHaveLength(2);
  expect(zones[1]!.top).toBeGreaterThan(zones[0]!.top);
  expect(cspViolations).toEqual([]);
  expect(cmsCspViolations).toEqual([]);
  await device.close();
});

test('the free-form designer and a kit by trade, and the results on screens', async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  await signIn(page, ADMIN, true);
  await openPage(page, 'Widgets');
  await page.getByRole('link', { name: 'בחירה עיצוב חופשי' }).click();
  await expectAccessible(page, 'designer templates');
  await page.getByRole('button', { name: 'התחלה ברוכים הבאים' }).click();
  await page.getByLabel('שם ה-Widget').fill('שקף כניסה');

  // Drag the title with the mouse: it moves (with snapping) and can be undone.
  const title = page.locator('[data-element]', { hasText: 'ברוכים הבאים' });
  const x = page.getByLabel('X', { exact: true });
  await title.click();
  const before = Number(await x.inputValue());
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  expect(Number(await x.inputValue())).toBeGreaterThan(before + 100);
  await page.getByRole('button', { name: 'ביטול' }).click();
  expect(Number(await x.inputValue())).toBe(before);

  // An image from the media library.
  await page.getByRole('button', { name: 'תמונה', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'בחירת תמונה' });
  await expectAccessible(page, 'image picker');
  await picker.getByRole('button', { name: /שימוש בתמונה מבצע השבוע/ }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('[data-element] img')).toBeVisible();
  await expectAccessible(page, 'designer');
  await page.getByRole('button', { name: 'Widget חדש' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /עריכת Widget: שקף כניסה/ }),
  ).toBeVisible();

  // Show it on a screen.
  await openPage(page, 'פלייליסטים');
  await page.getByLabel('שם הפלייליסט').fill('שקפים');
  await page.getByRole('button', { name: 'פלייליסט חדש' }).click();
  await page
    .getByRole('region', { name: 'הוספת Widget' })
    .getByRole('button', { name: 'הוספה שקף כניסה' })
    .click();
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(page.getByText('הפלייליסט נשמר והמסכים עודכנו.')).toBeVisible();

  const device = await browser.newContext({ ignoreHTTPSErrors: true });
  const player = await device.newPage();
  await player.goto('/player/');
  const code = (await player.getByTestId('pairing-code').textContent({ timeout: 15_000 }))?.trim();
  await openPage(page, 'מסכים');
  const addForm = page.getByRole('form', { name: 'הוספת מסך' });
  await addForm.getByLabel('קוד חיבור').fill(code ?? '');
  await addForm.getByLabel('שם מלא').fill('מסך שקפים');
  await addForm.getByLabel('פלייליסט').selectOption({ label: 'שקפים' });
  await addForm.getByRole('button', { name: 'הוספת מסך' }).click();

  await expect(player.locator('.w-design-text', { hasText: 'ברוכים הבאים' })).toBeVisible({
    timeout: 20_000,
  });
  const image = player.locator('.w-design-image img');
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
  await device.close();

  // A kit by trade (same sign-in: each two-factor sign-in counts toward the user's limit).
  await test.step('a kit by trade: the restaurant menu, its art and ticker on a screen', async () => {
    await openPage(page, 'תבניות תצוגה');
    await expect(page.getByRole('heading', { name: 'לפי תחום' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'ערכת מסעדה על מסך' })).toBeVisible();
    await expectAccessible(page, 'layouts with the kits by trade');
    await page.getByRole('button', { name: 'יצירת ערכה מסעדה' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /עריכת תבנית: מסעדה — ביסטרו הגפן/ }),
    ).toBeVisible({ timeout: 30_000 });

    const device = await browser.newContext({ ignoreHTTPSErrors: true });
    const player = await device.newPage();
    const cspViolations: string[] = [];
    player.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text());
    });
    await player.goto('/player/');
    const code = (
      await player.getByTestId('pairing-code').textContent({ timeout: 15_000 })
    )?.trim();
    await openPage(page, 'מסכים');
    const addForm = page.getByRole('form', { name: 'הוספת מסך' });
    await addForm.getByLabel('קוד חיבור').fill(code ?? '');
    await addForm.getByLabel('שם מלא').fill('מסך מסעדה');
    await addForm.getByRole('button', { name: 'הוספת מסך' }).click();
    await expect(page.getByText('המסך חובר בהצלחה.')).toBeVisible();
    await page.getByRole('button', { name: 'עריכה מסך מסעדה' }).click();
    const dialog = page.getByRole('dialog', { name: 'עריכת מסך' });
    await dialog.getByLabel('תבנית תצוגה').selectOption({ label: 'מסעדה — ביסטרו הגפן' });
    await dialog.getByRole('button', { name: 'שמירה' }).click();

    // The menu with shekel prices, the dish of the day with its illustration, and the ticker.
    const menu = player.locator('.w-menu');
    await expect(menu).toContainText('סטייק אנטריקוט', { timeout: 20_000 });
    await expect(menu).toContainText('₪');
    await expect(player.locator('.w-ticker')).toHaveAttribute('dir', 'rtl');
    const art = player.locator('.w-design-image img');
    await expect
      .poll(() => art.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 60_000 })
      .toBeGreaterThan(0);
    expect(cspViolations).toEqual([]);
    await device.close();
  });
});

test('a schedule switches what a screen shows, live', async ({ page, browser }) => {
  await signIn(page, ADMIN, true);
  await openPage(page, 'תזמון');
  await expectAccessible(page, 'schedules');
  await page.getByLabel('שם הלוח').fill('אירועים');
  await page.getByRole('button', { name: 'לוח זמנים חדש' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: /עריכת לוח זמנים: אירועים/ }),
  ).toBeVisible();

  // One entry, active all day every day: the announcements playlist in full screen.
  await page.getByRole('button', { name: 'הוספת שורה' }).click();
  const entry = page.getByRole('group', { name: /^שורה 1:/ });
  await entry.getByLabel('שם השורה').fill('הודעה מיוחדת');
  await entry.getByLabel('מה להציג').selectOption({ label: 'פס הודעות' });
  await entry.getByRole('checkbox', { name: 'כל היום' }).check();
  const timeline = page.getByRole('region', { name: 'מה יוצג השבוע' });
  await expect(timeline.getByText('עכשיו מוצג: הודעה מיוחדת')).toBeVisible();
  await expectAccessible(page, 'schedule editor');
  await page.getByRole('button', { name: 'שמירת הלוח' }).click();
  await expect(page.getByText('הלוח נשמר. המסכים מתעדכנים.')).toBeVisible();

  // A screen with a layout by default, and the schedule on top.
  const device = await browser.newContext({ ignoreHTTPSErrors: true });
  const player = await device.newPage();
  await player.goto('/player/');
  const code = (await player.getByTestId('pairing-code').textContent({ timeout: 15_000 }))?.trim();
  await openPage(page, 'מסכים');
  const addForm = page.getByRole('form', { name: 'הוספת מסך' });
  await addForm.getByLabel('קוד חיבור').fill(code ?? '');
  await addForm.getByLabel('שם מלא').fill('מסך אירועים');
  await addForm.getByRole('button', { name: 'הוספת מסך' }).click();
  await expect(page.getByText('המסך חובר בהצלחה.')).toBeVisible();
  await page.getByRole('button', { name: 'עריכה מסך אירועים' }).click();
  const dialog = page.getByRole('dialog', { name: 'עריכת מסך' });
  await dialog.getByLabel('תבנית תצוגה').selectOption({ label: 'לובי ראשי' });
  await dialog.getByLabel('לוח זמנים').selectOption({ label: 'אירועים' });
  await dialog.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('row', { name: /מסך אירועים/ })).toContainText('תזמון: אירועים');

  // The scheduled playlist fills the screen instead of the layout.
  await expect(player.locator('.w-ticker')).toContainText('ברוכים הבאים לבית הספר', {
    timeout: 20_000,
  });
  await expect(player.locator('.zone')).toHaveCount(1);
  await expect(player.locator('.w-clock-time')).toHaveCount(0);

  // A time window: the ticker only tomorrow (the screen's clock), so it leaves the screen now.
  const tomorrow = new Date(Date.now() + 86_400_000);
  const tomorrowLabel = new Intl.DateTimeFormat('he', {
    weekday: 'short',
    timeZone: 'Asia/Jerusalem',
  }).format(tomorrow);
  await openPage(page, 'פלייליסטים');
  await page.getByRole('link', { name: /עריכה פס הודעות/ }).click();
  await page.getByRole('button', { name: /מתי להציג\s*הודעות/ }).click();
  const when = page.getByRole('group', { name: 'מתי להציג את הודעות' });
  await when.getByRole('checkbox', { name: tomorrowLabel }).check();
  await expect(
    page.getByRole('region', { name: 'תוכן הפלייליסט' }).getByRole('listitem'),
  ).toContainText(`מתוזמן: ${tomorrowLabel}`);
  await expectAccessible(page, 'playlist editor (time window)');
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(page.getByText('הפלייליסט נשמר והמסכים עודכנו.')).toBeVisible();
  await expect(player.locator('.w-ticker')).toHaveCount(0, { timeout: 20_000 });
  // Back to always: the ticker returns.
  await when.getByRole('button', { name: 'להציג תמיד' }).click();
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(page.getByText('הפלייליסט נשמר והמסכים עודכנו.')).toBeVisible();
  await expect(player.locator('.w-ticker')).toContainText('ברוכים הבאים לבית הספר', {
    timeout: 20_000,
  });

  // Disabling the entry brings the layout back, without touching the screen.
  await openPage(page, 'תזמון');
  await page.getByRole('link', { name: 'עריכה אירועים' }).click();
  await page
    .getByRole('group', { name: /^שורה 1:/ })
    .getByRole('checkbox', { name: 'פעילה' })
    .uncheck();
  await expect(timeline.getByText('עכשיו מוצג: התוכן הרגיל של המסך')).toBeVisible();
  await page.getByRole('button', { name: 'שמירת הלוח' }).click();
  await expect(page.getByText('הלוח נשמר. המסכים מתעדכנים.')).toBeVisible();
  await expect(player.locator('.w-clock-time')).toHaveText(/^\d{2}:\d{2}$/, { timeout: 20_000 });
  await expect(player.locator('.zone')).toHaveCount(2);

  // Shabbat and holidays: first the place, in the organization settings.
  await openPage(page, 'הגדרות ארגון');
  const sacred = page.getByRole('region', { name: 'שבת וחגים' });
  await sacred.getByLabel('עיר להתחלה (לא חובה)').selectOption({ label: 'ירושלים' });
  await sacred.getByRole('button', { name: 'שמירת ההגדרה' }).click();
  await expect(sacred.getByText('ההגדרה נשמרה. המסכים יקבלו את הזמנים החדשים.')).toBeVisible();
  await expect(sacred.getByRole('list')).toContainText('שבת');
  await expectAccessible(page, 'organization settings (Shabbat and holidays)');

  // The entry again, but not on Shabbat: the timeline marks Shabbat, and the screen decides
  // by itself from the periods in its manifest.
  await openPage(page, 'תזמון');
  await page.getByRole('link', { name: 'עריכה אירועים' }).click();
  const shabbatEntry = page.getByRole('group', { name: /^שורה 1:/ });
  await shabbatEntry.getByRole('checkbox', { name: 'פעילה' }).check();
  await shabbatEntry.getByLabel('שבת וחג').selectOption({ label: 'לא בשבת וחג' });
  await expect(timeline.getByText(/^שבת: \d{2}:\d{2}–\d{2}:\d{2}$/).first()).toBeVisible();
  await expectAccessible(page, 'schedule editor (Shabbat and holidays)');
  await page.getByRole('button', { name: 'שמירת הלוח' }).click();
  await expect(page.getByText('הלוח נשמר. המסכים מתעדכנים.')).toBeVisible();
  const orgId = /\/orgs\/([^/]+)\//.exec(page.url())?.[1] ?? '';
  const periods = (
    (await (await page.request.get(`/api/v1/orgs/${orgId}/sacred-times?days=2`)).json()) as {
      times: { periods: { start: string; end: string }[] };
    }
  ).times.periods;
  const now = Date.now();
  if (periods.some((p) => Date.parse(p.start) <= now && now < Date.parse(p.end))) {
    // Run on Shabbat or a holiday in Jerusalem: the layout stays.
    await expect(player.locator('.zone')).toHaveCount(2);
  } else {
    await expect(player.locator('.w-ticker')).toContainText('ברוכים הבאים לבית הספר', {
      timeout: 20_000,
    });
  }
  await shabbatEntry.getByLabel('שבת וחג').selectOption({ label: 'תמיד' });
  await shabbatEntry.getByRole('checkbox', { name: 'פעילה' }).uncheck();
  await page.getByRole('button', { name: 'שמירת הלוח' }).click();
  await expect(page.getByText('הלוח נשמר. המסכים מתעדכנים.')).toBeVisible();
  await expect(player.locator('.w-clock-time')).toHaveText(/^\d{2}:\d{2}$/, { timeout: 20_000 });
  await expect(player.locator('.zone')).toHaveCount(2);

  // An emergency alert to this screen only: on screen within seconds, over the content.
  await openPage(page, 'התראות חירום');
  await expect(page.getByText('אין התראות פעילות')).toBeVisible();
  await page.getByRole('button', { name: 'פינוי מיידי' }).click();
  await expect(page.getByLabel(/^כותרת/)).toHaveValue('פינוי מיידי');
  await page.getByRole('radio', { name: 'מסכים נבחרים' }).check();
  await page.getByRole('checkbox', { name: 'מסך אירועים' }).check();
  await expectAccessible(page, 'alerts');
  await page.getByRole('button', { name: 'הצגה במסכים' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'הצגה במסכים' }).click();
  await expect(page.getByText('ההתראה נשלחה למסך אחד.')).toBeVisible();
  await expect(player.locator('.alert-layer h1')).toHaveText('פינוי מיידי', { timeout: 10_000 });
  await expect(player.locator('.alert-layer')).toHaveAttribute('data-style', 'emergency');
  await expect(player.locator('.zone')).toHaveCount(2); // the content keeps running underneath
  await expectAccessible(page, 'alerts (active)');

  // Ending it brings the content back at once.
  await page.getByRole('button', { name: 'סיום ההתראה: פינוי מיידי' }).click();
  await expect(
    page.getByText('ההתראה "פינוי מיידי" הסתיימה. המסכים חוזרים לתוכן הרגיל.'),
  ).toBeVisible();
  await expect(player.locator('.alert-layer')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('row', { name: /פינוי מיידי/ })).toContainText('הסתיימה');

  // Touch screen: a directory whose zone opens a map; the map's zone goes back.
  for (const [name, setUp] of [
    ['מפה', { action: 'חזרה לתבנית הקודמת', label: 'חזרה' }],
    ['מדריך', { action: 'פתיחת: מפה', label: 'פתיחת המפה' }],
  ] as const) {
    await openPage(page, 'תבניות תצוגה');
    await page.getByLabel('שם התבנית').fill(name);
    await page.getByRole('button', { name: 'תבנית חדשה' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `עריכת תבנית: ${name}` }),
    ).toBeVisible();
    const zone = page.getByRole('group', { name: /אזור 1/ });
    await zone.getByLabel('פלייליסט').selectOption({ label: 'שעון' });
    await zone.getByLabel('בנגיעה (מסך מגע)').selectOption({ label: setUp.action });
    await zone.getByLabel('שם לקורא מסך').fill(setUp.label);
    await page.getByRole('button', { name: 'שמירת התבנית' }).click();
    await expect(page.getByText('התבנית נשמרה והמסכים עודכנו.')).toBeVisible();
  }
  await expectAccessible(page, 'layout editor (touch)');
  await openPage(page, 'מסכים');
  await page.getByRole('button', { name: 'עריכה מסך אירועים' }).click();
  const touchDialog = page.getByRole('dialog', { name: 'עריכת מסך' });
  await touchDialog.getByLabel('תבנית תצוגה').selectOption({ label: 'מדריך' });
  await touchDialog.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('row', { name: /מסך אירועים/ })).toContainText('מדריך');

  // A tap opens the map; Enter on the focused "back" zone returns (keyboard or switch).
  const open = player.getByRole('button', { name: 'פתיחת המפה' });
  await expect(open).toBeVisible({ timeout: 20_000 });
  await open.click();
  const back = player.getByRole('button', { name: 'חזרה' });
  await expect(back).toBeVisible({ timeout: 10_000 });
  await expect(open).toHaveCount(0);
  await back.focus();
  await player.keyboard.press('Enter');
  await expect(open).toBeVisible({ timeout: 10_000 });

  // A screen group: one assignment gives every screen in it the same layout.
  await openPage(page, 'מסכים');
  const groupsRegion = page.getByRole('region', { name: 'קבוצות מסכים' });
  await groupsRegion.getByRole('button', { name: 'קבוצה חדשה' }).click();
  const groupDialog = page.getByRole('dialog', { name: 'קבוצה חדשה' });
  await groupDialog.getByLabel(/שם הקבוצה/).fill('קומה 2');
  await groupDialog
    .getByRole('group', { name: 'המסכים בקבוצה' })
    .getByRole('checkbox', { name: 'מסך אירועים' })
    .check();
  await expectAccessible(page, 'screen group dialog');
  await groupDialog.getByRole('button', { name: 'שמירת הקבוצה' }).click();
  await expect(groupsRegion.getByText('מסך אחד: מסך אירועים')).toBeVisible();
  await groupsRegion.getByRole('button', { name: /שיוך תוכן\s*קומה 2/ }).click();
  const assignDialog = page.getByRole('dialog', { name: 'שיוך תוכן לקבוצה: קומה 2' });
  await assignDialog.getByLabel('תבנית תצוגה').selectOption({ label: 'לובי ראשי' });
  await assignDialog.getByRole('button', { name: 'שיוך לכל המסכים' }).click();
  await expect(page.getByText('התוכן שויך למסך אחד, והוא מתעדכן.')).toBeVisible();
  await expect(page.getByRole('row', { name: /מסך אירועים/ })).toContainText('לובי ראשי');
  await expect(player.locator('.w-clock-time')).toHaveText(/^\d{2}:\d{2}$/, { timeout: 20_000 });
  await expect(player.locator('.zone')).toHaveCount(2);
  await device.close();
});

/**
 * A meeting room: an admin sets it up with the PIN, it is booked at its screen and in the
 * dashboard. Runs inside a signed-in test: each sign-in uses a two-step code, and those are
 * limited per user (10 in 15 minutes).
 */
async function meetingRoomJourney(page: Page, browser: Browser) {
  // An admin adds a room and the PIN for booking at screens.
  await openPage(page, 'חדרי ישיבות');
  const orgId = /\/orgs\/([^/]+)\/rooms/.exec(page.url())?.[1] ?? '';
  expect(orgId).not.toBe('');
  await expect(page.getByText('עדיין אין חדרים')).toBeVisible();
  await page.getByRole('button', { name: 'הוספת חדר' }).click();
  const roomDialog = page.getByRole('dialog', { name: 'הוספת חדר' });
  await roomDialog.getByRole('textbox', { name: /^שם החדר/ }).fill('חדר ישיבות גדול');
  await roomDialog.getByRole('spinbutton', { name: /^מספר מקומות/ }).fill('10');
  await roomDialog.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('החדר נשמר.')).toBeVisible();
  await page.getByLabel(/^קוד חדש/).fill('246810');
  await page.getByRole('button', { name: 'שמירת הקוד' }).click();
  await expect(page.getByText('פעיל: יש קוד להזמנה מהמסך.')).toBeVisible();
  await expectAccessible(page, 'rooms');

  // A room widget on a screen next to the room.
  const api = `/api/v1/orgs/${orgId}`;
  const roomId = (
    (await (await page.request.get(`${api}/rooms`)).json()) as { rooms: { id: string }[] }
  ).rooms[0]!.id;
  const widget = await page.request.post(`${api}/widgets`, {
    data: { type: 'room', name: 'דלת חדר הישיבות', config: { roomId } },
  });
  expect(widget.status()).toBe(201);
  const widgetId = ((await widget.json()) as { widget: { id: string } }).widget.id;
  const playlist = (
    (await (await page.request.post(`${api}/playlists`, { data: { name: 'דלת' } })).json()) as {
      playlist: { id: string };
    }
  ).playlist.id;
  await page.request.put(`${api}/playlists/${playlist}/items`, {
    data: { items: [{ widgetId, durationMs: null }] },
  });
  const device = await browser.newContext({ ignoreHTTPSErrors: true, hasTouch: true });
  const player = await device.newPage();
  await player.goto('/player/');
  const code = (await player.getByTestId('pairing-code').textContent({ timeout: 15_000 }))?.trim();
  const paired = await page.request.post(`${api}/screens`, {
    data: { code, name: 'מסך חדר הישיבות', playlistId: playlist },
  });
  expect(paired.status()).toBe(201);

  // The screen shows the room free; booking needs the PIN (a wrong one is refused).
  await expect(player.locator('.w-room-state')).toHaveText('פנוי', { timeout: 20_000 });
  await expect(player.locator('.w-room-place')).toHaveText('10 מקומות');
  await player.getByRole('button', { name: 'הזמנת החדר ל-15 דקות' }).click();
  const pad = player.getByRole('dialog', { name: 'הקלידו את קוד ההזמנה' });
  await expect(pad).toBeVisible();
  const press = async (digits: string) => {
    for (const digit of digits) await pad.getByRole('button', { name: `ספרה ${digit}` }).click();
    await pad.getByRole('button', { name: 'אישור' }).click();
  };
  await press('111111');
  await expect(pad.getByRole('alert')).toHaveText('הקוד שגוי. נסו שוב.');
  await press('246810');
  await expect(pad).toBeHidden();
  await expect(player.locator('.w-room-state')).toHaveText('תפוס', { timeout: 10_000 });
  await expect(player.getByRole('button', { name: 'סיום הפגישה עכשיו' })).toBeVisible();

  // The dashboard shows it, booked at the screen (by no one); a member books a later meeting,
  // and the screen lists it at once (titles stay hidden on the screen).
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'חדרי ישיבות' })).toBeVisible();
  await expect(page.getByText('הוזמן במסך')).toBeVisible();
  const later = new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 300_000) * 300_000);
  const end = new Date(later.getTime() + 30 * 60_000);
  const two = (n: number) => String(n).padStart(2, '0');
  const dayOf = (d: Date) =>
    `${String(d.getFullYear())}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const timeOf = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;
  await page.getByRole('button', { name: 'הזמנת חדר ישיבות גדול' }).click();
  const booking = page.getByRole('dialog', { name: 'הזמנת חדר' });
  await booking.getByLabel(/^תאריך/).fill(dayOf(later));
  await booking.getByLabel(/^משעה/).fill(timeOf(later));
  // Across midnight the meeting ends the next day: keep it on one day for this test.
  await booking.getByLabel(/^עד שעה/).fill(dayOf(end) === dayOf(later) ? timeOf(end) : '23:59');
  await booking.getByRole('textbox', { name: /^כותרת/ }).fill('תכנון רבעוני');
  await expectAccessible(page, 'booking dialog');
  await booking.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('החדר הוזמן.')).toBeVisible();
  await expect(player.locator('.w-room-next-list')).toContainText('פגישה', { timeout: 15_000 });
  await expect(player.locator('.w-room-next-list')).not.toContainText('תכנון רבעוני');

  // Ending the meeting at the screen frees the room.
  await player.getByRole('button', { name: 'סיום הפגישה עכשיו' }).click();
  await press('246810');
  await expect(player.locator('.w-room-state')).toHaveText('פנוי', { timeout: 10_000 });
  await device.close();
}

async function integrationsJourney(page: Page) {
  // An admin creates an API key for a fire panel: shown once, with the chosen permissions.
  await openPage(page, 'אינטגרציות');
  await expect(page.getByText('עדיין אין מפתחות API.')).toBeVisible();
  await expectAccessible(page, 'integrations');
  await page.getByRole('button', { name: 'מפתח חדש' }).click();
  const dialog = page.getByRole('dialog', { name: 'מפתח חדש' });
  await dialog.getByRole('textbox', { name: /^שם/ }).fill('מערכת כיבוי');
  await dialog.getByLabel('הפעלה וסיום של התראות חירום').check();
  await expectAccessible(page, 'new key dialog');
  await dialog.getByRole('button', { name: 'יצירה' }).click();
  const shown = dialog.getByRole('textbox', { name: 'מפתח' });
  await expect(shown).toHaveValue(/^rbk_[A-Za-z0-9_-]{43}$/);
  const token = await shown.inputValue();
  await dialog.getByRole('button', { name: 'סיום' }).click();
  await expect(page.getByRole('table')).toContainText('מערכת כיבוי');
  await expect(page.getByRole('table')).not.toContainText(token);

  // The fire panel starts and ends an alert with the key (no cookies, no browser).
  const panel = await request.newContext({
    baseURL: new URL(page.url()).origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { authorization: `Bearer ${token}` },
  });
  const started = await panel.post('/api/integrations/v1/alerts', {
    data: { style: 'emergency', title: 'תרגיל פינוי', durationMinutes: 5 },
  });
  expect(started.status()).toBe(201);
  const alertId = ((await started.json()) as { alert: { id: string } }).alert.id;
  // Its permissions are only what it was given.
  expect((await panel.get('/api/integrations/v1/screens')).status()).toBe(403);
  await openPage(page, 'התראות חירום');
  await expect(page.getByText('API: מערכת כיבוי').first()).toBeVisible();
  expect((await panel.post(`/api/integrations/v1/alerts/${alertId}/end`)).status()).toBe(200);

  // A webhook (the address does not exist here, so the test reports a failure).
  await openPage(page, 'אינטגרציות');
  await page.getByRole('button', { name: 'Webhook חדש' }).click();
  const hookDialog = page.getByRole('dialog', { name: 'Webhook חדש' });
  await hookDialog.getByRole('textbox', { name: /^שם/ }).fill('Teams');
  await hookDialog.getByRole('textbox', { name: /^כתובת/ }).fill('https://hooks.invalid/teams');
  await hookDialog.getByLabel('מסך התנתק').check();
  await hookDialog.getByRole('button', { name: 'יצירה' }).click();
  await expect(hookDialog.getByRole('textbox', { name: 'סוד החתימה' })).toHaveValue(/^whsec_/);
  await hookDialog.getByRole('button', { name: 'סיום' }).click();
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Teams' }) });
  await card.getByRole('button', { name: 'שליחת בדיקה' }).click();
  await expect(card.getByText(/הבדיקה נכשלה/)).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page, 'integrations with a key and a webhook');

  // Revoking the key stops it at once.
  await page.getByRole('button', { name: 'ביטול המפתח מערכת כיבוי' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ביטול המפתח' }).click();
  await expect(page.getByRole('table')).toContainText('בוטל');
  expect((await panel.get('/api/integrations/v1/alerts')).status()).toBe(401);
  await panel.dispose();
}

test('operations: what a screen shows, proof of play and CSV export', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await signIn(page, ADMIN, true);

  // A playlist with a short image, on a fresh screen.
  await openPage(page, 'פלייליסטים');
  await page.getByLabel('שם הפלייליסט').fill('דוח');
  await page.getByRole('button', { name: 'פלייליסט חדש' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /עריכת פלייליסט: דוח/ })).toBeVisible();
  await page.getByRole('button', { name: 'הוספה מבצע השבוע' }).click();
  await page.getByLabel('משך בשניות עבור מבצע השבוע').fill('3');
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(page.getByText('הפלייליסט נשמר והמסכים עודכנו.')).toBeVisible();

  const device = await browser.newContext({ ignoreHTTPSErrors: true });
  // Simulates a native wrapper (Electron/Android) bridge that can capture the screen.
  await device.addInitScript(() => {
    Object.defineProperty(window, 'RubinnyNative', {
      value: {
        platform: 'electron',
        version: 'e2e',
        capabilities: ['screenshot'],
        capture: async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const g = canvas.getContext('2d')!;
          g.fillStyle = '#1d4ed8';
          g.fillRect(0, 0, 320, 180);
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.8);
          });
          return new Uint8Array(await blob!.arrayBuffer());
        },
      },
    });
  });
  const player = await device.newPage();
  await player.goto('/player/');
  const code = (await player.getByTestId('pairing-code').textContent({ timeout: 15_000 }))?.trim();
  await openPage(page, 'מסכים');
  const addForm = page.getByRole('form', { name: 'הוספת מסך' });
  await addForm.getByLabel('קוד חיבור').fill(code ?? '');
  await addForm.getByLabel('שם מלא').fill('מסך ניטור');
  await addForm.getByLabel('פלייליסט').selectOption({ label: 'דוח' });
  await addForm.getByRole('button', { name: 'הוספת מסך' }).click();
  await expect(page.getByText('המסך חובר בהצלחה.')).toBeVisible();
  await expect(player.locator('.layer img')).toBeVisible({ timeout: 20_000 });

  // The screen page shows what the screen reports it is playing (next heartbeat ≤ 30 s).
  await page.getByRole('link', { name: 'מסך ניטור' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'מסך ניטור' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'מוצג עכשיו' }).getByText('מבצע השבוע'),
  ).toBeVisible({ timeout: 50_000 });
  await expect(page.getByText('השעון מסונכרן', { exact: false })).toBeVisible();

  // Remote screenshot through the (simulated) wrapper bridge.
  await expect(page.getByText('אפליקציית מחשב')).toBeVisible();
  await page.getByRole('button', { name: 'צילום מסך עכשיו' }).click();
  const shot = page.getByRole('img', { name: /צילום מסך של מסך ניטור/ });
  await expect(shot).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  await expectAccessible(page, 'screen page');

  // Proof of play: uploaded by the player every 30 s.
  await openPage(page, 'דוחות', 'דוחות הצגה');
  const row = page.getByRole('row', { name: /מבצע השבוע/ });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 75_000, intervals: [5000] });
  await expect(row.getByRole('cell').nth(1)).toHaveText(/^[1-9]\d*$/);
  await expectAccessible(page, 'reports');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'ייצוא כל ההצגות (CSV)' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^rubinny-plays-.*-events\.csv$/);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.startsWith('\uFEFF"started_at","time_zone","duration_seconds","screen"')).toBe(true);
  expect(csv).toContain('"מסך ניטור","main","media","מבצע השבוע"');
  await device.close();

  await test.step('a meeting room, booked at its screen and in the dashboard', async () => {
    await meetingRoomJourney(page, browser);
  });

  await test.step('integrations: an API key for a fire panel, and a webhook', async () => {
    await integrationsJourney(page);
  });
});

test('admin invites a teacher (mail disabled: link shown to admin)', async ({ page }) => {
  await signIn(page, ADMIN, true);
  await mainNav(page).getByRole('link', { name: 'חברים', exact: true }).click();
  await expectAccessible(page, 'members');
  const inviteForm = page.getByRole('form', { name: 'הזמנת חבר/ה' });
  await inviteForm.getByLabel('אימייל').fill(TEACHER.email);
  await inviteForm.getByLabel('תפקיד').selectOption('EDITOR');
  await inviteForm.getByRole('button', { name: 'שליחת הזמנה' }).click();
  const link = page.locator('code', { hasText: '/accept-invitation#token=' });
  await expect(link).toBeVisible();
  inviteUrl = (await link.textContent())?.trim() ?? '';
  await expect(
    page.getByRole('region', { name: 'הזמנות ממתינות' }).getByRole('listitem'),
  ).toContainText(TEACHER.email);
});

test('teacher registers through the invitation and sees the organization', async ({ page }) => {
  await page.goto(new URL(inviteUrl).pathname + new URL(inviteUrl).hash);
  // The secret token is removed from the address bar immediately.
  await expect(page).toHaveURL(/\/accept-invitation$/);
  await expectAccessible(page, 'accept invitation');
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.getByText('הוזמנת להצטרף לארגון.')).toBeVisible();
  await page.getByLabel('שם מלא').fill(TEACHER.name);
  await page.getByLabel('אימייל').fill(TEACHER.email);
  await page.getByLabel('סיסמה').fill(TEACHER.password);
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await expect(page.getByText('החשבון נוצר. אפשר להתחבר.')).toBeVisible();

  await signIn(page, TEACHER, false);
  await expect(page.getByRole('heading', { level: 3, name: 'בית ספר הדגמה' })).toBeVisible();
  await expect(page.getByText('תפקיד: עורך/ת')).toBeVisible();
  // Editors see no administration links.
  await expect(mainNav(page).getByRole('link', { name: 'חברים', exact: true })).toHaveCount(0);

  // Switch to English: direction and language follow.
  await page.getByRole('combobox', { name: 'שפה' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expectAccessible(page, 'dashboard (en)');
});

// One admin sign-in for both parts: two-factor checks are rate limited per user (10 per 15
// minutes), and the journey signs the admin in many times.
test("approval of an editor's change; the admin changes the role, reviews the audit log and legal pages", async ({
  page,
  browser,
}) => {
  await signIn(page, ADMIN, true);
  await test.step("an editor's change waits for an admin's approval", async () => {
    // The admin turns approval on.
    await mainNav(page).getByRole('link', { name: 'הגדרות ארגון', exact: true }).click();
    await page.getByRole('checkbox', { name: 'אישור מנהל לשינויי תוכן' }).check();
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('השינויים נשמרו.')).toBeVisible();

    // The teacher (an editor) edits the announcements ticker, in her own browser.
    const teacherContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER, false);
    await mainNav(teacher).getByRole('link', { name: 'Widgets', exact: true }).click();
    await teacher.getByRole('link', { name: 'עריכה הודעות' }).click();
    await teacher.getByLabel(/^טקסט/).fill('מבחנים מחר בשמונה');
    await teacher.getByRole('button', { name: 'שמירת ה-Widget' }).click();
    // Information, not an error; nothing changed yet.
    await expect(teacher.getByRole('status').filter({ hasText: 'נשלח לאישור מנהל' })).toBeVisible();
    await teacher.reload();
    await expect(teacher.getByLabel(/^טקסט/)).toHaveValue('ברוכים הבאים לבית הספר');
    await mainNav(teacher).getByRole('link', { name: 'אישורים', exact: true }).click();
    await expect(
      teacher.getByRole('button', { name: 'ביטול הבקשה: Widget: הודעות' }),
    ).toBeVisible();

    // The admin approves; the change is live.
    await mainNav(page).getByRole('link', { name: 'אישורים', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'ממתין לאישור' })).toBeVisible();
    await expectAccessible(page, 'approvals');
    await page.getByRole('button', { name: 'אישור: Widget: הודעות' }).click();
    await expect(page.getByText('השינוי אושר ועלה למסכים.')).toBeVisible();
    await teacher.goto(page.url().replace(/approvals$/, 'widgets'));
    await teacher.getByRole('link', { name: 'עריכה הודעות' }).click();
    await expect(teacher.getByLabel(/^טקסט/)).toHaveValue('מבחנים מחר בשמונה');
    await teacherContext.close();

    // Back to direct changes for the rest of the journey.
    await mainNav(page).getByRole('link', { name: 'הגדרות ארגון', exact: true }).click();
    await page.getByRole('checkbox', { name: 'אישור מנהל לשינויי תוכן' }).uncheck();
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.getByText('השינויים נשמרו.')).toBeVisible();
  });
  await mainNav(page).getByRole('link', { name: 'חברים', exact: true }).click();
  await page
    .getByRole('combobox', { name: `שינוי תפקיד עבור ${TEACHER.name}` })
    .selectOption('VIEWER');
  await expect(
    page.getByRole('combobox', { name: `שינוי תפקיד עבור ${TEACHER.name}` }),
  ).toHaveValue('VIEWER');

  await openPage(page, 'יומן פעולות');
  await expect(page.getByRole('cell', { name: 'member.role_changed' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'invitation.accepted' })).toBeVisible();
  await expectAccessible(page, 'audit');

  await mainNav(page).getByRole('link', { name: 'הגדרות ארגון', exact: true }).click();
  await expectAccessible(page, 'org settings');

  for (const [name, heading] of [
    ['הצהרת נגישות', 'הצהרת נגישות'],
    ['מדיניות פרטיות', 'מדיניות פרטיות'],
    ['מדיניות עוגיות', 'מדיניות עוגיות'],
    ['תנאי שימוש', 'תנאי שימוש'],
  ] as const) {
    await page.getByRole('contentinfo').getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectAccessible(page, name);
  }

  await page.getByRole('button', { name: 'הגדרות פרטיות ועוגיות' }).click();
  const dialog = page.getByRole('dialog', { name: 'הגדרות פרטיות ועוגיות' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'privacy dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await test.step('the operator sees the server status; a teacher does not', async () => {
    // From the legal pages (outside the app shell) back to the dashboard.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'לוח בקרה' })).toBeVisible();
    await openPage(page, 'מצב השרת');
    const table = page.getByRole('table', { name: 'מצב השרת' });
    await expect(table.getByRole('row', { name: /שירותים/ })).toContainText('תקין');
    // ClamAV answers in the stack: its version and signatures are shown.
    await expect(table.getByRole('row', { name: /אנטי-וירוס/ })).toContainText(/חתימות \d+/);
    // No backup was made in this test run.
    await expect(table.getByRole('row', { name: /גיבוי אחרון/ })).toContainText('תקלה');
    await expect(page.getByRole('region', { name: 'שימוש' })).toContainText('ארגונים');
    await expectAccessible(page, 'server status');

    const teacherContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const teacher = await teacherContext.newPage();
    await signIn(teacher, TEACHER, false);
    await expect(mainNav(teacher).getByRole('link', { name: 'מצב השרת' })).toHaveCount(0);
    await teacher.goto('/operator');
    await expect(teacher.getByText('הדף זמין רק למפעיל ההתקנה.')).toBeVisible();
    await teacherContext.close();
  });

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'העמוד לא נמצא' })).toBeVisible();
});

test('security headers are present on the CMS', async ({ request }) => {
  const res = await request.get('/login');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['cache-control']).toBe('no-cache');
  expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(res.headers()['cross-origin-resource-policy']).toBe('same-origin');
  // The attribution, without a version (LICENSING.md).
  expect(res.headers()['x-powered-by']).toBe('Rubinny (open source)');
  const api = await request.get('/api/v1/about');
  expect(api.headers()['x-powered-by']).toBe('Rubinny (open source)');
  expect(await api.json()).toMatchObject({ name: 'Rubinny', openSource: true });
});

test('the About page credits Rubinny, with its license and source code', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'אודות', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'אודות Rubinny' })).toBeVisible();
  await expect(page.getByTestId('about-powered-by')).toHaveText('מופעל על ידי Rubinny · קוד פתוח');
  await expect(page.locator('meta[name="generator"]')).toHaveAttribute('content', /Rubinny/);
  await expectAccessible(page, 'about');
});

/** Main pages: navigation link and page heading (null: any level-1 heading). */
const MAIN_PAGES: [string, string | null][] = [
  ['לוח בקרה', 'לוח בקרה'],
  ['מדיה', 'ספריית מדיה'],
  ['פלייליסטים', 'פלייליסטים'],
  ['Widgets', 'Widgets'],
  ['תבניות תצוגה', 'תבניות תצוגה'],
  ['תזמון', 'תזמון'],
  ['מסכים', 'מסכים'],
  ['דוחות', 'דוחות הצגה'],
  ['חברים', 'חברי הארגון'],
  ['הגדרות ארגון', null],
  ['יומן פעולות', 'יומן פעולות'],
  ['החשבון שלי', 'החשבון שלי'],
];

/** Presses Tab (or Shift+Tab) until `target` has the focus (fails after `max` presses). */
async function tabTo(
  page: Page,
  target: ReturnType<Page['locator']>,
  key: 'Tab' | 'Shift+Tab' = 'Tab',
  max = 80,
) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key);
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error(`Tab never reached ${target.toString()}`);
}

/** The focused element shows a clear indicator (WCAG 2.4.7). */
async function expectVisibleFocus(page: Page) {
  const style = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const css = getComputedStyle(el);
    return {
      outline: css.outlineStyle,
      width: parseFloat(css.outlineWidth),
      shadow: css.boxShadow,
    };
  });
  expect(style).not.toBeNull();
  const outlined = style!.outline !== 'none' && style!.width >= 2;
  expect(outlined || style!.shadow !== 'none', JSON.stringify(style)).toBe(true);
}

/** Opens a main page from the navigation and waits for its heading. */
async function openMain(page: Page, link: string, heading: string | null) {
  await mainNav(page).getByRole('link', { name: link, exact: true }).click();
  await expect(
    heading
      ? page.getByRole('heading', { level: 1, name: heading, exact: true })
      : page.getByRole('heading', { level: 1 }),
  ).toBeVisible();
}

// One sign-in for all the accessibility checks: repeated two-factor sign-ins would (rightly)
// hit the brute-force protection.
test('accessibility: keyboard only, reflow at 320 px, dark mode, reduced motion', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await test.step('keyboard only: sign in with two-factor', async () => {
    await page.goto('/login');
    await tabTo(page, page.getByLabel('אימייל'));
    await expectVisibleFocus(page);
    await page.keyboard.type(ADMIN.email);
    await tabTo(page, page.getByLabel('סיסמה', { exact: false }));
    await page.keyboard.type(ADMIN.password);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'אימות דו-שלבי' })).toBeVisible();
    await tabTo(page, page.getByLabel(/קוד אימות/));
    await page.keyboard.type(await nextCode());
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'לוח בקרה' })).toBeVisible();
  });

  await test.step('keyboard only: skip link and every main page', async () => {
    // After a page change the focus is on the main heading (announced by screen readers).
    await expect(page.getByRole('heading', { level: 1, name: 'לוח בקרה' })).toBeFocused();
    // The skip link is reachable and moves the focus into the main content.
    const skip = page.getByRole('link', { name: 'דלג לתוכן הראשי' });
    await tabTo(page, skip, 'Shift+Tab');
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#main')))).toBe(true);
    for (const [link, heading] of MAIN_PAGES) {
      // From the page content, the navigation is behind (it comes first in the page).
      const target = mainNav(page).getByRole('link', { name: link, exact: true });
      await tabTo(page, target, 'Shift+Tab');
      await expectVisibleFocus(page);
      await page.keyboard.press('Enter');
      await expect(
        heading
          ? page.getByRole('heading', { level: 1, name: heading, exact: true })
          : page.getByRole('heading', { level: 1 }),
      ).toBeVisible();
    }
  });

  await test.step('dark mode: axe on every main page; reduced motion stops transitions', async () => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    for (const [link, heading] of MAIN_PAGES) {
      await openMain(page, link, heading);
      await expectAccessible(page, `${link} (dark)`);
    }
    const moving = await page.evaluate(
      () =>
        [...document.querySelectorAll('*')].filter((el) => {
          const css = getComputedStyle(el);
          const longest = (value: string) =>
            Math.max(
              ...value.split(',').map((v) => parseFloat(v) * (v.trim().endsWith('ms') ? 1 : 1000)),
            );
          return longest(css.transitionDuration) > 10 || longest(css.animationDuration) > 10;
        }).length,
    );
    expect(moving, 'elements still animating with reduced motion').toBe(0);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  });

  await test.step('reflow at 320 CSS pixels (400% zoom): no page-level horizontal scrolling', async () => {
    await page.setViewportSize({ width: 320, height: 720 });
    for (const [link, heading] of MAIN_PAGES) {
      // At this width the navigation is behind the menu button.
      await page.getByRole('button', { name: 'תפריט', exact: true }).click();
      await openMain(page, link, heading);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${link}`).toBeLessThanOrEqual(1);
      await expectAccessible(page, `${link} at 320px`);
    }
  });
});
