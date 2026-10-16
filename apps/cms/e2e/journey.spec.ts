import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
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
  await expect(page.getByTestId('powered-by')).toContainText('Powered by Rubinny');
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

test('the free-form designer: drag, images, and the result on a screen', async ({
  page,
  browser,
}) => {
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
  await device.close();
});

test('operations: what a screen shows, proof of play and CSV export', async ({ page, browser }) => {
  test.setTimeout(180_000);
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

test('admin changes the role, reviews the audit log and legal pages', async ({ page }) => {
  await signIn(page, ADMIN, true);
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
