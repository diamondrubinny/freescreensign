/**
 * Draft legal texts. They describe what Rubinny itself does; each operator
 * (the data controller) must adapt them and have them reviewed by a lawyer,
 * privacy officer and accessibility consultant before publication.
 */
export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}

type Docs = Record<'accessibility' | 'privacy' | 'cookies' | 'terms', LegalDoc>;

const UPDATED = '2026-10-15';

export const LEGAL: Record<'he' | 'en', Docs> = {
  he: {
    accessibility: {
      title: 'הצהרת נגישות',
      updated: UPDATED,
      sections: [
        {
          heading: 'מחויבות לנגישות',
          paragraphs: [
            'אנו רואים חשיבות רבה במתן שירות שוויוני לכלל המשתמשים, כולל אנשים עם מוגבלות. לוח הניהול של Rubinny תוכנן ופותח מתוך כוונה לעמוד בדרישות הנגישות.',
          ],
        },
        {
          heading: 'רמת הנגישות',
          paragraphs: [
            'המערכת מכוונת לרמה AA של הנחיות WCAG 2.1, ולהתאמה לתקן הישראלי ת"י 5568. ההתאמה טרם אומתה בבדיקה של מורשה/ית נגישות.',
          ],
        },
        {
          heading: 'התאמות שבוצעו',
          paragraphs: [
            'מבנה סמנטי עם כותרות ואזורי ניווט (Landmarks), וקישור "דלג לתוכן".',
            'ניווט מלא במקלדת עם סימון פוקוס בולט. במעבר עמוד הפוקוס עובר לכותרת הראשית.',
            'תוויות לכל שדות הטפסים, והודעות שגיאה מקושרות לשדות ומוקראות לקוראי מסך.',
            'תמיכה מלאה בעברית ובכיוון ימין-לשמאל, ובאנגלית.',
            'ניגודיות צבעים של 4.5:1 לפחות. המידע לא מועבר באמצעות צבע בלבד.',
            'תמיכה בהגדלת טקסט עד 200% ובהעדפת הפחתת תנועה של מערכת ההפעלה.',
            'תפריט התאמות נגישות: גודל טקסט, ניגודיות גבוהה, הדגשת קישורים, גופן קריא ועצירת אנימציות.',
            'בדיקות אוטומטיות (axe-core) על כל העמודים במסגרת תהליך הפיתוח.',
          ],
        },
        {
          heading: 'מגבלות ידועות',
          paragraphs: [
            'תוכן שמועלה על ידי משתמשים (תמונות, סרטונים וקבצים) עשוי שלא לכלול חלופות טקסט. האחריות לכך היא של מעלה התוכן.',
            'רכיבי עריכה גרפיים שיתווספו בעתיד ייבדקו בנפרד.',
          ],
        },
        {
          heading: 'פניות בנושא נגישות',
          paragraphs: [
            'נתקלתם בבעיית נגישות? פנו לרכז/ת הנגישות של מפעיל המערכת. ציינו את כתובת העמוד, את תיאור הבעיה ואת הטכנולוגיה המסייעת שבה השתמשתם. נשתדל להשיב תוך 14 ימי עבודה.',
            '[פרטי רכז/ת הנגישות: שם, טלפון, אימייל — ימולאו על ידי מפעיל המערכת]',
          ],
        },
      ],
    },
    privacy: {
      title: 'מדיניות פרטיות',
      updated: UPDATED,
      sections: [
        {
          heading: 'מי אחראי למידע',
          paragraphs: [
            'Rubinny היא תוכנה בקוד פתוח המותקנת ומופעלת על ידי ארגונים שונים. האחראי למידע (Controller) הוא מפעיל המערכת שבה אתם משתמשים. [שם המפעיל ופרטי יצירת קשר — ימולאו על ידי המפעיל]',
          ],
        },
        {
          heading: 'איזה מידע נאסף ולמה',
          paragraphs: [
            'פרטי חשבון: שם, אימייל וסיסמה (נשמרת כ-hash בלבד). המטרה: יצירת חשבון והתחברות. הבסיס: ביצוע ההתקשרות.',
            'אבטחה: סוד אימות דו-שלבי (מוצפן), חיבורים פעילים, ומזהה מוסתר של כתובת IP (HMAC, ללא אפשרות שחזור). המטרה: אבטחת החשבון ומניעת שימוש לרעה. הבסיס: אינטרס לגיטימי.',
            'יומן פעולות (Audit Log) של פעולות ניהול. המטרה: בקרה ואבטחה. הבסיס: אינטרס לגיטימי.',
            'תוכן שאתם מעלים להצגה על מסכים. המטרה: אספקת השירות.',
          ],
        },
        {
          heading: 'משך שמירה',
          paragraphs: [
            'פרטי החשבון נשמרים כל עוד החשבון פעיל.',
            'חיבורים פגי תוקף וקישורים חד-פעמיים נמחקים אוטומטית.',
            'יומן הפעולות נשמר 365 ימים כברירת מחדל.',
          ],
        },
        {
          heading: 'צדדים שלישיים',
          paragraphs: [
            'Rubinny אינה כוללת כלי מדידה, פרסום או מעקב. מיילים נשלחים דרך שרת הדואר שהגדיר המפעיל, אם הוגדר. [רשימת ספקי המפעיל, למשל אחסון ודואר — תמולא על ידי המפעיל]',
            'Widgets: פידי RSS מורדים על ידי השרת, כך שאתר הפיד רואה את כתובת השרת בלבד. אם המפעיל הפעיל מזג אוויר, השרת שולח לשירות מזג האוויר (Open-Meteo או שירות שהגדיר המפעיל) רק את קווי הרוחב והאורך שהוזנו ב-Widget. Widget "דף אינטרנט" נטען ישירות במסך, ולכן האתר המוצג מקבל את כתובת ה-IP של המסך וכפוף למדיניות הפרטיות שלו.',
          ],
        },
        {
          heading: 'הזכויות שלכם',
          paragraphs: [
            'אתם יכולים לעיין במידע ולהוריד אותו ("הורדת המידע שלי"), לתקן אותו בעמוד "החשבון שלי", ולמחוק את החשבון. לבקשות נוספות, כגון התנגדות או הגבלת עיבוד, פנו למפעיל.',
          ],
        },
        {
          heading: 'אבטחת מידע',
          paragraphs: [
            'התקשורת מוצפנת (HTTPS), הסיסמאות נשמרות ב-Argon2id, וסודות אימות דו-שלבי מוצפנים ב-AES-256-GCM. אין מערכת מאובטחת באופן מוחלט.',
          ],
        },
      ],
    },
    cookies: {
      title: 'מדיניות עוגיות',
      updated: UPDATED,
      sections: [
        {
          heading: 'עוגיות שבשימוש',
          paragraphs: [
            '\u200E__Host-rubinny_session — עוגייה חיונית, מאובטחת (HttpOnly, Secure, SameSite=Lax). היא שומרת על החיבור שלכם, ותוקפה עד 30 יום. אינה משותפת עם צד שלישי ואינה דורשת הסכמה.',
          ],
        },
        {
          heading: 'אחסון מקומי בדפדפן',
          paragraphs: [
            'rubinny.locale — שפת הממשק שבחרתם.',
            'rubinny.a11y — התאמות הנגישות שבחרתם.',
            'הערכים נשמרים רק בדפדפן שלכם ואינם נשלחים לשרת. אפשר למחוק אותם בכל עת דרך "הגדרות פרטיות ועוגיות".',
          ],
        },
        {
          heading: 'כלי מדידה ופרסום',
          paragraphs: [
            'אין. אם המפעיל יוסיף כלים כאלה, הם ייטענו רק אחרי הסכמה מפורשת, ותוכלו לבטל את ההסכמה בכל עת.',
          ],
        },
      ],
    },
    terms: {
      title: 'תנאי שימוש',
      updated: UPDATED,
      sections: [
        {
          heading: 'כללי',
          paragraphs: [
            'השימוש במערכת כפוף לתנאים אלה ולתנאים שקבע המפעיל. [תנאי המפעיל — ימולאו על ידי המפעיל]',
          ],
        },
        {
          heading: 'תוכן',
          paragraphs: [
            'אתם אחראים לתוכן שאתם מעלים ומציגים, ובכלל זה לזכויות יוצרים, לפרטיות של אנשים המופיעים בו, ולהתאמתו לחוק. אין להעלות תוכן פוגעני, מפר זכויות או זדוני.',
          ],
        },
        {
          heading: 'התוכנה',
          paragraphs: [
            'Rubinny היא תוכנה חופשית ברישיון GNU AGPL-3.0, ומסופקת "כפי שהיא" (AS IS), ללא אחריות מכל סוג, ככל שהדין מתיר.',
          ],
        },
      ],
    },
  },
  en: {
    accessibility: {
      title: 'Accessibility statement',
      updated: UPDATED,
      sections: [
        {
          heading: 'Our commitment',
          paragraphs: [
            'We are committed to providing an equal experience to all users, including people with disabilities. The Rubinny dashboard was designed and built with accessibility in mind.',
          ],
        },
        {
          heading: 'Conformance target',
          paragraphs: [
            'The system targets WCAG 2.1 level AA and the Israeli standard IS 5568. Conformance has not yet been verified by a certified accessibility auditor.',
          ],
        },
        {
          heading: 'What we did',
          paragraphs: [
            'Semantic structure with headings and landmarks, plus a "skip to content" link.',
            'Full keyboard navigation with a visible focus indicator. Focus moves to the main heading on page change.',
            'Labels on all form fields, and error messages linked to fields and announced to screen readers.',
            'Full support for Hebrew right-to-left and for English.',
            'Colour contrast of at least 4.5:1. Information is never conveyed by colour alone.',
            'Text resizing up to 200%, and support for the reduced-motion system preference.',
            'Accessibility options menu: text size, high contrast, link underlines, readable font and stopping animations.',
            'Automated checks (axe-core) on every page as part of development.',
          ],
        },
        {
          heading: 'Known limitations',
          paragraphs: [
            'User-uploaded content (images, videos, files) may lack text alternatives; the uploader is responsible for it.',
            'Graphical editors added in future versions will be tested separately.',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: [
            "Found an accessibility problem? Contact the operator's accessibility coordinator. Please include the page address, a description of the problem and the assistive technology you used. We aim to reply within 14 business days.",
            '[Accessibility coordinator name, phone and email — to be completed by the operator]',
          ],
        },
      ],
    },
    privacy: {
      title: 'Privacy policy',
      updated: UPDATED,
      sections: [
        {
          heading: 'Who is responsible',
          paragraphs: [
            'Rubinny is open-source software installed and run by different organizations. The data controller is the operator of the system you are using. [Operator name and contact details — to be completed by the operator]',
          ],
        },
        {
          heading: 'What we collect and why',
          paragraphs: [
            'Account data: name, email and password (stored only as a hash). Purpose: account creation and sign-in. Legal basis: contract.',
            'Security data: two-factor secret (encrypted), active sessions, and a pseudonymized IP identifier (HMAC, not reversible). Purpose: account security and abuse prevention. Legal basis: legitimate interest.',
            'Audit log of administrative actions. Purpose: oversight and security. Legal basis: legitimate interest.',
            'Content you upload for display on screens. Purpose: providing the service.',
          ],
        },
        {
          heading: 'Retention',
          paragraphs: [
            'Account data is kept while the account is active.',
            'Expired sessions and one-time links are deleted automatically.',
            'The audit log is kept for 365 days by default.',
          ],
        },
        {
          heading: 'Third parties',
          paragraphs: [
            "Rubinny contains no analytics, advertising or tracking tools. Emails are sent through the operator's mail server, if one is configured. [Operator's processors, e.g. hosting and email — to be completed by the operator]",
            'Widgets: RSS feeds are downloaded by the server, so the feed site only sees the server\'s address. If the operator enabled weather, the server sends the weather service (Open-Meteo or one the operator configured) only the latitude and longitude entered in the widget. A "web page" widget is loaded directly on the screen, so the displayed site receives the screen\'s IP address and is subject to its own privacy policy.',
          ],
        },
        {
          heading: 'Your rights',
          paragraphs: [
            'You can access and download your data ("Download my data"), correct it on "My account", and delete your account. For other requests, such as objection or restriction of processing, contact the operator.',
          ],
        },
        {
          heading: 'Security',
          paragraphs: [
            'Traffic is encrypted (HTTPS), passwords use Argon2id, and two-factor secrets are encrypted with AES-256-GCM. No system is perfectly secure.',
          ],
        },
      ],
    },
    cookies: {
      title: 'Cookie policy',
      updated: UPDATED,
      sections: [
        {
          heading: 'Cookies we use',
          paragraphs: [
            '__Host-rubinny_session — essential, secure (HttpOnly, Secure, SameSite=Lax). It keeps you signed in and lasts up to 30 days. It is not shared with third parties and needs no consent.',
          ],
        },
        {
          heading: 'Local storage',
          paragraphs: [
            'rubinny.locale — your interface language.',
            'rubinny.a11y — your accessibility options.',
            'These values are stored only in your browser and never sent to the server. You can clear them at any time via "Privacy & cookie settings".',
          ],
        },
        {
          heading: 'Analytics and advertising',
          paragraphs: [
            'None. If an operator adds such tools, they will load only after explicit consent, which you can withdraw at any time.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of use',
      updated: UPDATED,
      sections: [
        {
          heading: 'General',
          paragraphs: [
            "Use of this system is subject to these terms and to the operator's terms. [Operator terms — to be completed by the operator]",
          ],
        },
        {
          heading: 'Content',
          paragraphs: [
            'You are responsible for content you upload and display, including copyright, the privacy of people shown, and legal compliance. Do not upload offensive, infringing or malicious content.',
          ],
        },
        {
          heading: 'The software',
          paragraphs: [
            'Rubinny is free software under the GNU AGPL-3.0, provided "as is" without warranty of any kind, to the extent permitted by law.',
          ],
        },
      ],
    },
  },
};
