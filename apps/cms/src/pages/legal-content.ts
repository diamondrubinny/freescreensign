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

const UPDATED = '2026-10-16';

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
            'בדיקות אוטומטיות (axe-core) על כל העמודים, במצב בהיר ובמצב כהה, במסגרת תהליך הפיתוח.',
            'בדיקות אוטומטיות של שימוש במקלדת בלבד (התחברות, כולל אימות דו-שלבי, ומעבר בין כל העמודים הראשיים), של הצגה ברוחב 320 פיקסלים (שקולה להגדלה של 400%) ללא גלילה אופקית, ושל עצירת תנועה כשמערכת ההפעלה מבקשת הפחתת תנועה.',
          ],
        },
        {
          heading: 'מגבלות ידועות',
          paragraphs: [
            'תוכן שמועלה על ידי משתמשים (תמונות, סרטונים וקבצים) עשוי שלא לכלול חלופות טקסט. האחריות לכך היא של מעלה התוכן.',
            'עורך העיצוב החופשי ותצוגת לוח הזמנים נבדקו בכלים אוטומטיים ובמקלדת, אך טרם נבדקו בעבודה מלאה עם קוראי מסך.',
            'התוכן שמוצג על המסכים עצמם (שילוט) מעוצב על ידי המפעיל, והנגישות שלו באחריותו.',
            'ההצהרה מבוססת על בדיקות אוטומטיות ועל בדיקה עצמית. טרם בוצעה בדיקה של מורשה/ית נגישות.',
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
            'נתוני תפעול של מסכים: זמני חיבור, מה הוצג ומתי (Proof-of-Play), וסטיית שעון המכשיר. המטרה: ניטור, דוחות הצגה והתראות. אין בהם מידע על צופים. הבסיס: אינטרס לגיטימי.',
            'התראות ניתוק (אם הופעלו): בעלי הארגון והמנהלים מקבלים מייל עם שם המסך והזמן. הבסיס: אינטרס לגיטימי.',
            'צילומי מסך מרחוק: כשעורך/ת מבקש/ת צילום של מסך (רק במסכים שמריצים אפליקציית Rubinny למחשב או ל-Android), נשמרת תמונה של מה שהמסך מציג באותו רגע: התמונה האחרונה בלבד לכל מסך, ללא מטא-דאטה. היא עשויה לכלול כל תוכן שמוצג על המסך. המטרה: תמיכה ובקרה. הבסיס: אינטרס לגיטימי.',
            'מכשירי מסך: מפתח מכשיר אקראי (נשמר בשרת כ-hash בלבד), סוג הנגן וגרסתו, ורזולוציית המסך. אפליקציות המסך שומרות את כתובת השרת ואת מפתח המכשיר על המכשיר עצמו בלבד. באפליקציית Android הם אינם נכללים בגיבויים ובהעברה בין מכשירים.',
          ],
        },
        {
          heading: 'משך שמירה',
          paragraphs: [
            'פרטי החשבון נשמרים כל עוד החשבון פעיל.',
            'חיבורים פגי תוקף וקישורים חד-פעמיים נמחקים אוטומטית.',
            'יומן הפעולות נשמר 365 ימים כברירת מחדל.',
            'נתוני זמינות של מסכים נשמרים 90 יום, ודוחות ההצגה 90 יום כברירת מחדל (ניתן להגדרה).',
            'צילום מסך מרחוק נשמר עד 7 ימים, ורק האחרון לכל מסך.',
            'גיבויים: המפעיל קובע אם לגבות, היכן ולכמה זמן. כלי הגיבוי של Rubinny מצפין את הגיבוי במפתח של המפעיל. [מדיניות הגיבוי של המפעיל — תמולא על ידי המפעיל]',
          ],
        },
        {
          heading: 'צדדים שלישיים',
          paragraphs: [
            'Rubinny אינה כוללת כלי מדידה, פרסום או מעקב. מיילים נשלחים דרך שרת הדואר שהגדיר המפעיל, אם הוגדר. [רשימת ספקי המפעיל, למשל אחסון ודואר — תמולא על ידי המפעיל]',
            'Widgets: פידי RSS וטבלאות נתונים (למשל Google Sheets) מורדים על ידי השרת, כך שהאתר המקורי רואה את כתובת השרת בלבד, ועותק של הנתונים נשמר בשרת עד 24 שעות. אם המפעיל הפעיל מזג אוויר, השרת שולח לשירות מזג האוויר (Open-Meteo או שירות שהגדיר המפעיל) רק את קווי הרוחב והאורך שהוזנו ב-Widget. Widget "דף אינטרנט" נטען ישירות במסך, ולכן האתר המוצג מקבל את כתובת ה-IP של המסך וכפוף למדיניות הפרטיות שלו.',
            'התחברות דרך הארגון (SSO): אם המפעיל הגדיר שירות התחברות (למשל Google Workspace או Microsoft Entra ID), ההתחברות מתבצעת אצל השירות הזה, והוא יודע שהתחברת. השרת שומר רק את המזהה הקבוע שהשירות נתן לחשבון ואת כתובת האימייל בזמן הקישור. הם כלולים בייצוא המידע ונמחקים עם החשבון.',
            'מאגר תמונות חופשי: מילות החיפוש נשלחות מהשרת ל-Openverse (או לשירות שהגדיר המפעיל) כדי למצוא תמונות. הדפדפן שלכם אינו פונה אליו, ולא נשלח מידע מזהה עליכם.',
            'אפליקציות המסך: הן פונות רק לשרת של המפעיל. רכיבי הדפדפן של המכשיר עשויים לפנות לשירותים של יצרן המכשיר או של Google לפי הגדרות ברירת המחדל שלהם (למשל Safe Browsing ב-WebView של Android, או עדכוני רכיבים ב-Chromium ב-Raspberry Pi). [דורש אימות מול התיעוד הרשמי של כל פלטפורמה]',
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
            'Automated checks (axe-core) on every page, in light and dark mode, as part of development.',
            'Automated tests of keyboard-only use (sign-in including two-factor, and moving between all main pages), of display at 320 CSS pixels wide (equivalent to 400% zoom) without horizontal scrolling, and of stopping motion when the operating system asks for reduced motion.',
          ],
        },
        {
          heading: 'Known limitations',
          paragraphs: [
            'User-uploaded content (images, videos, files) may lack text alternatives; the uploader is responsible for it.',
            'The free-form designer and the schedule timeline were tested with automated tools and the keyboard, but not yet in full use with screen readers.',
            'The content shown on the screens themselves (signage) is designed by the operator, who is responsible for its accessibility.',
            'This statement is based on automated tests and self-assessment. It has not yet been reviewed by a certified accessibility auditor.',
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
            'Screen operations data: connection times, what was shown and when (proof of play), and the device clock offset. Purpose: monitoring, play reports and alerts. It contains no data about viewers. Legal basis: legitimate interest.',
            'Offline alerts (when enabled): owners and admins receive an email with the screen name and time. Legal basis: legitimate interest.',
            'Remote screenshots: when an editor asks for a screenshot of a screen (only screens running the Rubinny desktop or Android app), an image of what the screen shows at that moment is stored: only the latest one per screen, without metadata. It may include anything shown on the screen. Purpose: support and oversight. Legal basis: legitimate interest.',
            'Screen devices: a random device key (stored on the server only as a hash), the player type and version, and the screen resolution. The screen apps keep the server address and the device key on the device itself only; on Android they are excluded from backups and device transfers.',
          ],
        },
        {
          heading: 'Retention',
          paragraphs: [
            'Account data is kept while the account is active.',
            'Expired sessions and one-time links are deleted automatically.',
            'The audit log is kept for 365 days by default.',
            'Screen uptime data is kept for 90 days, and play reports for 90 days by default (configurable).',
            'A remote screenshot is kept for up to 7 days, and only the latest one per screen.',
            "Backups: the operator decides whether, where and for how long to back up. Rubinny's backup tool encrypts backups with the operator's key. [Operator's backup policy — to be completed by the operator]",
          ],
        },
        {
          heading: 'Third parties',
          paragraphs: [
            "Rubinny contains no analytics, advertising or tracking tools. Emails are sent through the operator's mail server, if one is configured. [Operator's processors, e.g. hosting and email — to be completed by the operator]",
            'Widgets: RSS feeds and data tables (Google Sheets, for example) are downloaded by the server, so the source site only sees the server\'s address, and a copy of the data is kept on the server for up to 24 hours. If the operator enabled weather, the server sends the weather service (Open-Meteo or one the operator configured) only the latitude and longitude entered in the widget. A "web page" widget is loaded directly on the screen, so the displayed site receives the screen\'s IP address and is subject to its own privacy policy.',
            'Sign-in through your organization (SSO): if the operator configured a sign-in service (Google Workspace or Microsoft Entra ID, for example), you sign in there and that service knows you signed in. The server keeps only the permanent identifier the service gives the account and the e-mail address at the time of linking; both are in your data export and are deleted with the account.',
            'Free image library: search words are sent from the server to Openverse (or a service the operator configured) to find images. Your browser does not contact it, and no identifying information about you is sent.',
            "Screen apps: they contact only the operator's server. The device's browser components may contact services of the device maker or Google according to their defaults (for example Safe Browsing in Android's WebView, or component updates in Chromium on Raspberry Pi). [Requires verification against each platform's official documentation]",
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
