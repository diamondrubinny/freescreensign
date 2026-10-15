# שלב 2 — Auth & Orgs (2a ✅)

השלב מחולק לשניים כדי שכל חלק יהיה בדיק בפני עצמו:

- **2a — שרת (מסמך זה):** מסד נתונים ו-Migrations, הרשמה והתחברות, אימות אימייל, איפוס סיסמה, MFA (TOTP), Sessions, ארגונים, חברויות, הזמנות, הרשאות, Audit Log וזכויות פרטיות (ייצוא ומחיקה).
- **2b — CMS:** שלד React עם RTL ונגישות, ומסכי Setup, התחברות, הרשמה, MFA וניהול חברים.

---

## 1. החלטות טכנולוגיות (2a)

| נושא               | בחירה                                                                             | למה                                                                                                     | חלופות                                                                 |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| גישה ל-DB          | **Kysely** + Migrations ב-TypeScript                                              | Query builder עם טיפוסים, שאילתות פרמטריות בלבד, בלי codegen ובלי מנוע בינארי. עובד בקונטיינר read-only | Prisma 7/8 (מחייב driver adapters ו-codegen, ו-v8 עדיין ב-RC), Drizzle |
| Hash סיסמאות       | **Argon2id** דרך `@node-rs/argon2` (m=19456KiB, t=2, p=1 — מינימום OWASP)         | prebuilds ל-musl/arm64/Windows בלי קומפילציה                                                            | bcrypt, scrypt                                                         |
| TOTP               | מימוש עצמי של **RFC 6238** על `node:crypto` (~60 שורות) + בדיקות מול וקטורי ה-RFC | בלי תלות חיצונית; הקוד קטן, קריא וניתן לאימות                                                           | otplib                                                                 |
| דואר               | **Nodemailer** (SMTP). במצב פיתוח: `console`. בבדיקות: `memory`                   | סטנדרט                                                                                                  | שירותי API (Resend, SES) — אפשר להוסיף בהמשך                           |
| ולידציה            | Zod בתוך ה-handlers, עם helper אחיד שמחזיר `VALIDATION_FAILED`                    | פשוט, בלי peer-deps                                                                                     | fastify-type-provider-zod (ייבחן מחדש כשנוסיף OpenAPI)                 |
| Rate limiting רגיש | Limiter ייעודי מעל Valkey, **fail-closed** (503 אם Valkey לא זמין)                | שליטה מלאה במפתחות (IP, אימייל, אתגר MFA)                                                               | הגדרות per-route של `@fastify/rate-limit`                              |

## 2. סכמת DB (Migration `0001_auth_orgs`)

| טבלה             | עמודות עיקריות                                                                                                                                                   | הערות                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `users`          | id, email (lowercase, unique), name, password_hash, email_verified_at, locale, mfa_secret_enc, mfa_pending_secret_enc, mfa_enabled_at, mfa_last_step, deleted_at | סוד ה-MFA מוצפן ב-AES-256-GCM                               |
| `recovery_codes` | user_id, code_hash, used_at                                                                                                                                      | 10 קודים, נשמרים כ-hash                                     |
| `sessions`       | id_hash (PK), user_id, expires_at, absolute_expires_at, last_seen_at, ip_hmac, user_agent                                                                        | ה-token עצמו לא נשמר                                        |
| `user_tokens`    | token_hash (PK), user_id, purpose, expires_at, used_at                                                                                                           | verify_email (24h), reset_password (1h), mfa_challenge (5m) |
| `organizations`  | id, name, require_admin_mfa (ברירת מחדל true), deleted_at                                                                                                        |                                                             |
| `memberships`    | org_id, user_id, role                                                                                                                                            | unique(org_id, user_id)                                     |
| `invitations`    | org_id, email, role, token_hash, invited_by, delivered_by_email, expires_at (7d), accepted_at, revoked_at                                                        |                                                             |
| `audit_logs`     | org_id, actor_user_id, action, target_type, target_id, ip_hmac, meta, created_at                                                                                 | IP נשמר כ-HMAC, לא גלוי                                     |

## 3. API

**ציבורי** (מוגן ב-Rate limit):

| Endpoint                                                                   | תיאור                                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/setup/status`                                                 | האם המערכת צריכה הגדרה ראשונית                                                                                       |
| `POST /api/v1/setup`                                                       | יצירת ה-Owner והארגון הראשון. פועל רק כשאין משתמשים, ודורש `SETUP_TOKEN` בפרודקשן                                    |
| `POST /api/v1/auth/register`                                               | לפי `REGISTRATION_MODE=open\|invite\|closed`. תשובה אחידה, כך שאי אפשר לגלות אם אימייל כבר רשום                      |
| `POST /api/v1/auth/verify-email` · `POST /api/v1/auth/verify-email/resend` |                                                                                                                      |
| `POST /api/v1/auth/login`                                                  | שגיאה גנרית. אם המשתמש לא קיים, מבוצע אימות דמה כדי שהתזמון לא יסגיר את זה. אם MFA פעיל → `mfaRequired` + `mfaToken` |
| `POST /api/v1/auth/mfa/verify`                                             | קוד TOTP או קוד שחזור. עד 5 ניסיונות לכל אתגר                                                                        |
| `POST /api/v1/auth/password/forgot` · `POST /api/v1/auth/password/reset`   | איפוס מבטל את כל ה-Sessions                                                                                          |

**מחייב Session:**

| Endpoint                                                                                                               | תיאור                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/v1/auth/session` · `POST /api/v1/auth/logout` · `POST /api/v1/auth/logout-all`                               |                                                                      |
| `POST /api/v1/auth/password/change`                                                                                    | מבטל את שאר ה-Sessions                                               |
| `POST /api/v1/auth/mfa/totp/setup` · `/enable` · `/disable` · `POST /api/v1/auth/mfa/recovery-codes`                   | הגדרה, הפעלה וכיבוי דורשים סיסמה או קוד                              |
| `GET/PATCH/DELETE /api/v1/me` · `GET /api/v1/me/export` · `GET /api/v1/me/sessions` · `DELETE /api/v1/me/sessions/:id` | זכויות גישה, תיקון, מחיקה וייצוא (GDPR / חוק הגנת הפרטיות)           |
| `GET/POST /api/v1/orgs`                                                                                                | יצירה מוגבלת ע"י `MAX_ORGS_PER_USER`                                 |
| `GET/PATCH /api/v1/orgs/:orgId`                                                                                        | קריאה: VIEWER. עדכון: ADMIN                                          |
| `GET /api/v1/orgs/:orgId/members` · `PATCH/DELETE .../members/:userId`                                                 | ADMIN. רק OWNER יכול לנהל OWNER-ים, ואי אפשר להסיר את ה-OWNER האחרון |
| `GET/POST /api/v1/orgs/:orgId/invitations` · `DELETE .../invitations/:id`                                              | ADMIN                                                                |
| `POST /api/v1/invitations/accept`                                                                                      | משתמש מחובר שהאימייל שלו תואם להזמנה                                 |
| `GET /api/v1/orgs/:orgId/audit`                                                                                        | ADMIN, עם Pagination                                                 |

## 4. אבטחה

- **Session:** Cookie בשם `__Host-rubinny_session` ב-HTTPS, עם HttpOnly, Secure ו-SameSite=Lax. תוקף מתגלגל של 14 ימים ותוקף מוחלט של 30 ימים. ב-DB נשמר רק SHA-256 של ה-token.
- **CSRF:** בכל בקשה משנה (POST, PATCH, DELETE) עם Cookie נבדקים `Origin` או `Sec-Fetch-Site` מול `PUBLIC_URL`, יחד עם SameSite=Lax. זו גישה מוכרת ב-OWASP ומחליפה את ה-CSRF token שתוכנן במקור.
- **IDOR/BOLA:** כל route של ארגון עובר guard שטוען את החברות של המשתמש. אם אין חברות → 404, כדי לא לחשוף שהארגון קיים. בבדיקות יש תרחישים שבהם משתמש מנסה לגשת לארגון אחר.
- **MFA לאדמינים:** אם `require_admin_mfa` פעיל, פעולות ADMIN נחסמות עם `MFA_SETUP_REQUIRED` עד שהמשתמש מגדיר MFA.
- **Tokens:** ‏256 ביט אקראיים, חד-פעמיים, ונשמרים כ-hash. בקישורים הם מועברים ב-fragment (‏`#token=`), ולכן לא מגיעים ללוגים של השרת או ל-Referer.
- **מניעת ניצול לרעה:** מגבלות לכל IP ולכל אימייל, ומגבלה ייעודית לאתגרי MFA. אם Valkey לא זמין, הבקשה נחסמת (fail-closed).
- **הצפנה:** המפתח `ENCRYPTION_KEY` (32 בתים) מגיע מ-ENV. ממנו נגזרים ב-HKDF מפתחות נפרדים ל-MFA ול-HMAC של כתובות IP, עם מספר גרסה כדי לאפשר רוטציה בעתיד.

## 5. פרטיות

- **ייצוא:** `GET /me/export` מחזיר JSON עם הפרופיל, החברויות, ה-Sessions (מטא-דאטה בלבד) ופעולות ה-Audit שהמשתמש ביצע.
- **מחיקה:** `DELETE /me` מאנונם את המשתמש, מוחק Sessions, Tokens ו-MFA, ומוחק (soft delete) ארגונים שבהם הוא החבר היחיד. אם הוא ה-OWNER היחיד בארגון שיש בו חברים נוספים → 409, וצריך להעביר בעלות קודם.
- **שמירה:**
  - Sessions ו-Tokens שפג תוקפם נמחקים כל שעה.
  - Audit Log נשמר `AUDIT_RETENTION_DAYS` ימים (ברירת מחדל 365).

## 6. בדיקות

- **יחידה:** וקטורי RFC 6238 ל-TOTP, Base32, הצפנה ופענוח, מדיניות סיסמאות, CSRF ו-Limiter.
- **Integration מול PostgreSQL ו-Valkey אמיתיים, כל קובץ בדיקות ב-schema נפרד:**
  - כל הזרימות: Setup, הרשמה, אימות, התחברות, MFA, איפוס, הזמנות ותפקידים.
  - ניסיונות גישה בין ארגונים (Tenants).
  - Rate limits.
  - מחיקה וייצוא של מידע אישי.

## 7. סיכונים ונושאים פתוחים

- כשה-SMTP כבוי, הזמנות מוחזרות כקישור לאדמין, והמשתמש שמצטרף דרכן לא מסומן כמי שאימת אימייל. לתעד זאת למפעילים.
- נוסח הודעות הדואר (עברית ואנגלית) הוא טיוטה.
- CAPTCHA בהרשמה פתוחה נדחה לשלב הענן (D3).

---

## 8. תוצאות 2a ✅

### בדיקות

- **113 בדיקות שרת עברו** (9 קבצים), מתוכן 43 בדיקות Integration מול PostgreSQL 17 ו-Valkey 8 אמיתיים.
- **‏RFC:** וקטורי HOTP (RFC 4226) ו-TOTP (RFC 6238, SHA1/256/512) עוברים.
- **בדיקה ידנית מלאה דרך Caddy ב-HTTPS, ב-Docker Compose:**
  - Setup עם `SETUP_TOKEN`: טוקן שגוי → 403, ניסיון Setup שני → 409.
  - Cookie מסוג `__Host-` עם Secure ו-HttpOnly.
  - פעולת אדמין בלי MFA → `MFA_SETUP_REQUIRED`.
  - הפעלת MFA, ואחריה התחברות דו-שלבית.
  - הזמנה כשה-SMTP כבוי: קישור עם `#token`.
  - CSRF חוסם בקשה מ-Origin זר.
  - `/health/ready` מחזיר 404 מבחוץ.
  - ב-DB, סוד ה-MFA מוצפן ו-IP נשמר כ-HMAC.

### החלטות שהתקבלו תוך כדי

- **Migrator עצמי** (טבלת `schema_migrations`, advisory lock, טרנזקציה לכל migration) במקום ה-Migrator של Kysely. הסיבה: ה-introspection של Kysely סורק טבלאות בכל ה-schemas, ונכשל כשבמקביל נמחק schema אחר. זה התגלה בבדיקות מקבילות, ועלול לקרות גם ב-DB משותף בפרודקשן.
- **ערכי ENV ריקים נחשבים כלא מוגדרים,** כי Docker Compose מעביר `VAR=` כמחרוזת ריקה.
- **אירוע `setup.completed` משויך לארגון,** כך שהוא מופיע ב-Audit Log שלו.

### מגבלות ידועות

- **נעילת חשבון לפי אימייל:** אחרי 5 ניסיונות כושלים ב-15 דקות, תוקף יכול לחסום זמנית התחברות של משתמש מסוים. זו פשרה מקובלת. בהמשך אפשר לשקול CAPTCHA במקום חסימה.
- **ה-Audit של הארגון** כולל פעולות ברמת הארגון בלבד. אירועי התחברות של משתמשים נשמרים ברמת המשתמש וזמינים לו בייצוא (`/me/export`).
- **מדיניות הסיסמאות** כוללת רשימת סיסמאות נפוצות מצומצמת. חיבור ל-HIBP (k-anonymity) ייבחן כ-Opt-in, כי הוא שולח hash חלקי לצד שלישי.
