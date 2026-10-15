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
