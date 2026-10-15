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

test.describe.configure({ mode: 'serial' });

test('first-run setup creates the administrator (RTL, accessible)', async ({ page }) => {
  expect(SETUP_TOKEN, 'E2E_SETUP_TOKEN must be set').not.toBe('');
  await page.goto('/login');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.getByTestId('powered-by')).toContainText('Powered by Rubinny');
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

  await page.getByRole('link', { name: 'חברים' }).click();
  await expect(page.getByRole('alert')).toContainText('יש להפעיל אימות דו-שלבי');

  await page.getByRole('link', { name: 'החשבון שלי' }).click();
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

  await page.getByRole('link', { name: 'חברים' }).click();
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
  await page.getByRole('link', { name: 'מדיה' }).click();
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
  await page.getByRole('link', { name: 'מדיה' }).click();
  await page
    .getByLabel('בחירת קבצים להעלאה')
    .setInputFiles([{ name: 'מבצע השבוע.png', mimeType: 'image/png', buffer: pngBytes }]);
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'מבצע השבוע' }) });
  await expect(card.getByText('מוכן')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'פלייליסטים' }).click();
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

  await page.getByRole('link', { name: 'מסכים' }).click();
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
  await page.getByRole('link', { name: 'פלייליסטים' }).click();
  await page.getByRole('link', { name: /עריכה לובי/ }).click();
  await page.getByRole('button', { name: 'הסרת מבצע השבוע' }).click();
  await page.getByRole('button', { name: 'שמירת הפלייליסט' }).click();
  await expect(player.getByText('אין תוכן להצגה · Nothing to show')).toBeVisible({
    timeout: 15_000,
  });

  // Disconnecting the screen sends the device back to pairing.
  await page.getByRole('link', { name: 'מסכים' }).click();
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
  await page.getByRole('link', { name: 'Widgets' }).click();
  await expectAccessible(page, 'widgets');
  await page.getByRole('link', { name: 'בחירה שעון ותאריך' }).click();
  await page.getByLabel('שם ה-Widget').fill('שעון');
  await page.getByRole('button', { name: 'Widget חדש' }).click();
  await expect(page.getByText('ה-Widget נשמר והמסכים עודכנו.')).toBeVisible();
  await expectAccessible(page, 'widget editor (clock)');

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
    await page.getByRole('link', { name: 'פלייליסטים' }).click();
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
  await page.getByRole('link', { name: 'תבניות תצוגה' }).click();
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
  await page.getByRole('link', { name: 'מסכים' }).click();
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

test('admin invites a teacher (mail disabled: link shown to admin)', async ({ page }) => {
  await signIn(page, ADMIN, true);
  await page.getByRole('link', { name: 'חברים' }).click();
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
  await expect(page.getByRole('link', { name: 'חברים' })).toHaveCount(0);

  // Switch to English: direction and language follow.
  await page.getByRole('combobox', { name: 'שפה' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expectAccessible(page, 'dashboard (en)');
});

test('admin changes the role, reviews the audit log and legal pages', async ({ page }) => {
  await signIn(page, ADMIN, true);
  await page.getByRole('link', { name: 'חברים' }).click();
  await page
    .getByRole('combobox', { name: `שינוי תפקיד עבור ${TEACHER.name}` })
    .selectOption('VIEWER');
  await expect(
    page.getByRole('combobox', { name: `שינוי תפקיד עבור ${TEACHER.name}` }),
  ).toHaveValue('VIEWER');

  await page.getByRole('link', { name: 'יומן פעולות' }).click();
  await expect(page.getByRole('cell', { name: 'member.role_changed' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'invitation.accepted' })).toBeVisible();
  await expectAccessible(page, 'audit');

  await page.getByRole('link', { name: 'הגדרות ארגון' }).click();
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
});
