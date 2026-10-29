// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { Locale } from '@rubinny/shared';

export type MailTemplate =
  | { kind: 'verify-email'; url: string }
  | { kind: 'reset-password'; url: string }
  | { kind: 'account-exists'; loginUrl: string; resetUrl: string }
  | { kind: 'invitation'; url: string; orgName: string; inviterName: string }
  | {
      kind: 'security-notice';
      event: 'password-changed' | 'mfa-enabled' | 'mfa-disabled' | 'mfa-attempts';
    }
  | { kind: 'screens-offline'; orgName: string; screens: string[]; minutes: number; url: string }
  | { kind: 'screens-online'; orgName: string; screens: string[]; url: string }
  | { kind: 'webhook-disabled'; orgName: string; webhook: string; url: string }
  | {
      kind: 'approval-requested';
      orgName: string;
      requester: string;
      item: string;
      url: string;
    };

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Copy {
  subject: string;
  lines: string[];
  action?: { label: string; url: string };
}

const SIGNATURE = { he: 'צוות Rubinny', en: 'The Rubinny team' } as const;

/** User-provided text in a subject line: never let it add header lines. */
const oneLine = (value: string) => value.replace(/[\r\n\t]+/g, ' ').slice(0, 120);

function copyFor(template: MailTemplate, locale: Locale): Copy {
  const he = locale === 'he';
  switch (template.kind) {
    case 'verify-email':
      return he
        ? {
            subject: 'אימות כתובת האימייל שלך ב-Rubinny',
            lines: ['לחצו על הכפתור כדי לאמת את כתובת האימייל.', 'הקישור תקף ל-24 שעות.'],
            action: { label: 'אימות אימייל', url: template.url },
          }
        : {
            subject: 'Verify your Rubinny email address',
            lines: [
              'Click the button to verify your email address.',
              'The link expires in 24 hours.',
            ],
            action: { label: 'Verify email', url: template.url },
          };
    case 'reset-password':
      return he
        ? {
            subject: 'איפוס סיסמה ב-Rubinny',
            lines: [
              'התקבלה בקשה לאיפוס הסיסמה שלך. הקישור תקף לשעה אחת.',
              'אם לא ביקשת איפוס, אפשר להתעלם מהודעה זו.',
            ],
            action: { label: 'איפוס סיסמה', url: template.url },
          }
        : {
            subject: 'Reset your Rubinny password',
            lines: [
              'We received a request to reset your password. The link expires in 1 hour.',
              'If you did not request this, you can ignore this email.',
            ],
            action: { label: 'Reset password', url: template.url },
          };
    case 'account-exists':
      return he
        ? {
            subject: 'כבר יש לך חשבון ב-Rubinny',
            lines: [
              'מישהו ניסה להירשם עם כתובת האימייל הזו, אבל כבר קיים עבורה חשבון.',
              `להתחברות: ${template.loginUrl}`,
              `שכחת סיסמה? ${template.resetUrl}`,
            ],
          }
        : {
            subject: 'You already have a Rubinny account',
            lines: [
              'Someone tried to sign up with this email address, but an account already exists.',
              `Sign in: ${template.loginUrl}`,
              `Forgot your password? ${template.resetUrl}`,
            ],
          };
    case 'invitation':
      return he
        ? {
            subject: `הוזמנת להצטרף ל-${template.orgName} ב-Rubinny`,
            lines: [
              `${template.inviterName} הזמין/ה אותך להצטרף לארגון ${template.orgName}.`,
              'ההזמנה תקפה ל-7 ימים.',
            ],
            action: { label: 'הצטרפות', url: template.url },
          }
        : {
            subject: `You're invited to join ${template.orgName} on Rubinny`,
            lines: [
              `${template.inviterName} invited you to join ${template.orgName}.`,
              'The invitation expires in 7 days.',
            ],
            action: { label: 'Accept invitation', url: template.url },
          };
    case 'screens-offline': {
      const many = template.screens.length > 1;
      return he
        ? {
            subject: many
              ? `${String(template.screens.length)} מסכים לא מחוברים ב-${oneLine(template.orgName)}`
              : `המסך "${oneLine(template.screens[0] ?? '')}" לא מחובר`,
            lines: [
              `המסכים הבאים בארגון ${template.orgName} לא התחברו לשרת במשך יותר מ-${String(template.minutes)} דקות:`,
              ...template.screens.map((name) => `• ${name}`),
              'בדקו שהמכשיר דולק ומחובר לרשת. כשהמסך יחזור, תישלח הודעה.',
            ],
            action: { label: 'צפייה במסכים', url: template.url },
          }
        : {
            subject: many
              ? `${String(template.screens.length)} screens offline in ${oneLine(template.orgName)}`
              : `Screen "${oneLine(template.screens[0] ?? '')}" is offline`,
            lines: [
              `These screens in ${template.orgName} have not reached the server for more than ${String(template.minutes)} minutes:`,
              ...template.screens.map((name) => `• ${name}`),
              'Check that the device is on and connected. You will get a message when it is back.',
            ],
            action: { label: 'View screens', url: template.url },
          };
    }
    case 'screens-online':
      return he
        ? {
            subject: `המסך "${oneLine(template.screens[0] ?? '')}" חזר לפעול`,
            lines: [
              `המסך ${template.screens.join(', ')} בארגון ${template.orgName} מחובר שוב ומציג תוכן.`,
            ],
            action: { label: 'צפייה במסכים', url: template.url },
          }
        : {
            subject: `Screen "${oneLine(template.screens[0] ?? '')}" is back online`,
            lines: [
              `${template.screens.join(', ')} in ${template.orgName} is connected again and showing content.`,
            ],
            action: { label: 'View screens', url: template.url },
          };
    case 'webhook-disabled':
      return he
        ? {
            subject: `ה-Webhook "${oneLine(template.webhook)}" הושבת`,
            lines: [
              `ה-Webhook "${template.webhook}" בארגון ${template.orgName} נכשל שוב ושוב, ולכן הושבת. לא יישלחו אליו אירועים עד שתפעילו אותו מחדש.`,
              'בדקו שהכתובת נכונה ושהשרת המקבל עונה, ואז הפעילו אותו בעמוד האינטגרציות.',
            ],
            action: { label: 'לעמוד האינטגרציות', url: template.url },
          }
        : {
            subject: `Webhook "${oneLine(template.webhook)}" was turned off`,
            lines: [
              `The webhook "${template.webhook}" in ${template.orgName} kept failing, so it was turned off. No events are sent to it until you turn it on again.`,
              'Check that the address is right and that the receiving server answers, then turn it on on the Integrations page.',
            ],
            action: { label: 'Open Integrations', url: template.url },
          };
    case 'approval-requested':
      return he
        ? {
            subject: `שינוי ממתין לאישור: ${oneLine(template.item)}`,
            lines: [
              `${template.requester} ביקש/ה לשנות את "${template.item}" בארגון ${template.orgName}.`,
              'השינוי לא יוצג במסכים עד שמנהל יאשר אותו.',
            ],
            action: { label: 'לבקשות שממתינות לאישור', url: template.url },
          }
        : {
            subject: `Change waiting for approval: ${oneLine(template.item)}`,
            lines: [
              `${template.requester} asked to change "${template.item}" in ${template.orgName}.`,
              'Screens will not show it until an admin approves it.',
            ],
            action: { label: 'Review pending changes', url: template.url },
          };
    case 'security-notice': {
      const events = {
        'password-changed': { he: 'הסיסמה שלך שונתה.', en: 'Your password was changed.' },
        'mfa-enabled': {
          he: 'אימות דו-שלבי הופעל בחשבונך.',
          en: 'Two-factor authentication was enabled.',
        },
        'mfa-disabled': {
          he: 'אימות דו-שלבי בוטל בחשבונך.',
          en: 'Two-factor authentication was disabled.',
        },
        'mfa-attempts': {
          he: 'היו בחשבונך ניסיונות כושלים רבים להקליד קוד אימות דו-שלבי, אחרי סיסמה נכונה. הכניסה עם קוד חסומה עד מחר.',
          en: 'There were many failed attempts at your two-factor code, after a correct password. Signing in with a code is blocked until tomorrow.',
        },
      } as const;
      return he
        ? {
            subject: 'התראת אבטחה מ-Rubinny',
            lines: [
              events[template.event].he,
              'אם לא ביצעת את הפעולה, אפס/י סיסמה מיד ופנה/י למנהל המערכת.',
            ],
          }
        : {
            subject: 'Rubinny security notice',
            lines: [
              events[template.event].en,
              'If this was not you, reset your password immediately and contact your administrator.',
            ],
          };
    }
  }
}

export function renderMail(template: MailTemplate, locale: Locale): RenderedMail {
  const copy = copyFor(template, locale);
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  const signature = SIGNATURE[locale];

  const text = [
    ...copy.lines,
    ...(copy.action ? ['', `${copy.action.label}: ${copy.action.url}`] : []),
    '',
    signature,
  ].join('\n');

  const paragraphs = copy.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
  const button = copy.action
    ? `<p><a href="${escapeHtml(copy.action.url)}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;border-radius:6px;text-decoration:none">${escapeHtml(copy.action.label)}</a></p>
<p style="font-size:13px;color:#4b5563">${escapeHtml(copy.action.url)}</p>`
    : '';
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><title>${escapeHtml(copy.subject)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111827">
${paragraphs}
${button}
<p>${escapeHtml(signature)}</p>
</body>
</html>`;

  return { subject: copy.subject, text, html };
}
