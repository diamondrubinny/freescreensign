# שלב 1 — Foundation ✅

**מטרה:** תשתית שכל השלבים הבאים נבנים עליה: Monorepo, שרת API מאובטח עם בדיקות, סביבת Docker מלאה, CI ומסמכי קהילה ורישוי.

## מה נבנה

| רכיב                     | תיאור                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo                 | pnpm workspaces + Turborepo, TypeScript 6 strict, ESLint (strictTypeChecked), Prettier                                                                                                                                                           |
| `packages/shared` (MIT)  | סכמת **Manifest v1** ל-Player, כולל בדיקת הפניות, מחזורים וגבולות. בנוסף: קודי Pairing (CSPRNG בלי modulo bias), תפקידים, שפות ו-RTL, וקודי שגיאה של ה-API                                                                                       |
| `apps/server` (AGPL)     | Fastify 5: ולידציית ENV (בלי לחשוף ערכים), Helmet/CSP, Rate limit (Valkey/Redis), מזהה בקשה שהשרת מייצר בעצמו, טיפול שגיאות גלובלי שאינו חושף פרטים פנימיים, הגבלת גודל גוף הבקשה, `/health` ו-`/health/ready`, וכיבוי מסודר (graceful shutdown) |
| `apps/server/Dockerfile` | Multi-stage, רץ כמשתמש `node` (לא root), קבצי האפליקציה לקריאה בלבד, כולל HEALTHCHECK                                                                                                                                                            |
| `deploy/`                | Docker Compose: Caddy (HTTPS אוטומטי וכותרות אבטחה), Server, PostgreSQL 17, Valkey 8, SeaweedFS (S3), ClamAV. רשת `backend` פנימית ללא גישה לאינטרנט, `read_only`, `cap_drop: ALL`, `no-new-privileges`                                          |
| CI                       | GitHub Actions (בדיקות פורמט, lint, טיפוסים, בדיקות כולל Integration מול Postgres/Valkey אמיתיים, build, `pnpm audit`, build של Docker), CodeQL, Dependabot. כל ה-Actions נעוצים ל-SHA                                                           |
| קהילה ורישוי             | `LICENSE` (AGPL-3.0), `LICENSING.md` (מפת רישיונות ותנאי סעיף 7), `TRADEMARKS.md`, `NOTICE`, `CONTRIBUTING.md` (DCO), `SECURITY.md`, `CODE_OF_CONDUCT.md`, תבניות Issues/PR                                                                      |

## הרצה

```bash
# Full stack
cd deploy
./generate-env.sh            # creates .env with random secrets (chmod 600)
docker compose up -d --build
curl -k https://localhost/health      # {"status":"ok"}

# Development
pnpm install
pnpm check                   # format + lint + typecheck + tests
```

## בדיקות שבוצעו

- **בדיקות אוטומטיות — 49 בסך הכול, כולן עברו:**
  - `shared`: 27 בדיקות.
  - `server`: 20 בדיקות יחידה ועוד 2 בדיקות Integration מול PostgreSQL ו-Valkey אמיתיים.
- **בדיקה ידנית של כל ה-Stack ב-Docker:**
  - כל 6 השירותים עלו במצב healthy.
  - `/health` עובד דרך Caddy ב-HTTP/2 ומחזיר את כל כותרות האבטחה.
  - `/health/ready` חסום מבחוץ (404) ומחזיר `ready` מבפנים.
  - בקשת HTTP מופנית ל-HTTPS (308).
  - 404 מחזיר את מבנה השגיאה המובנה.
- **אבטחה:**
  - S3 חוסם גישה אנונימית ומפתח סודי שגוי (403), ומפתח נכון מאפשר יצירה, רשימה ומחיקה.
  - ClamAV מגיב ל-`PING` עם `PONG`.
  - לקונטיינר ברשת `backend` אין גישה לאינטרנט.
  - ה-image רץ כ-`uid 1000` וקבצי האפליקציה בו לקריאה בלבד.
- `pnpm audit --prod`: לא נמצאו חולשות ידועות.

## החלטות במהלך השלב

- **MinIO → SeaweedFS:** MinIO Community הפסיק להפיץ images ב-2025 ועבר לארכיון ב-2026. השרת מדבר עם S3 רגיל, כך שאפשר להחליף ל-AWS S3, Cloudflare R2, Garage ועוד.
- **Redis → Valkey:** רישיון BSD ותאימות מלאה.
- **TRUST_PROXY:** Fastify 5 מתייחס ל-hop count כלא-אמין, ולכן משתמשים ברשימת כתובות או ב-preset (`uniquelocal` ב-Compose).
- **TypeScript 6.0:** גרסה 7 (Native) עדיין לא נתמכת ב-typescript-eslint.

## מגבלות ידועות / לשלבים הבאים

- HSTS: ב-`.env.example` הערך הוא `HSTS_MAX_AGE=0` לבדיקות על localhost. בפרודקשן חובה `31536000`.
- ה-Rate limit הגלובלי ממשיך לעבוד בלי הגבלה אם Valkey נופל (fail-open). Endpoints רגישים (Auth, Pairing) יקבלו ב-שלב 2 הגבלה ייעודית שנחסמת כש-Valkey נופל (fail-closed).
- גישת Player למדיה (presigned URL דרך דומיין משנה, או סטרימינג דרך השרת) תוחלט ב-שלב 3.
- ClamAV צריך כ-1.5–2GB זיכרון RAM וגישת יציאה לעדכוני חתימות.
- כשה-Docker משתמש ב-userland-proxy, השרת רואה את כתובת ה-Gateway במקום כתובת הלקוח. לבדוק בפריסה האמיתית.
