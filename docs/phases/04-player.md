# שלב 4 — Player Core: חיבור מסכים, פלייליסטים ונגן Offline ✅

**מטרה:** מסך אמיתי מציג תוכן. מסך חדש מציג קוד חיבור, מנהל התוכן מחבר אותו לארגון ב-CMS ומשייך לו פלייליסט. הנגן מוריד את התוכן, מאמת את תקינותו, שומר מקומית, ממשיך לנגן גם בלי אינטרנט, ומתעדכן מיד כשמשנים תוכן.

## 1. היקף

| נכלל                                                                                             | נדחה לשלבים הבאים                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| מסכים: חיבור בקוד, שינוי שם, שיוך פלייליסט, כיוון מסך, ניתוק, Reload מרחוק, סטטוס Online/Offline | Layouts עם אזורים ו-Designer (שלב 5)        |
| פלייליסטים בסיסיים: תמונות וסרטונים מהספרייה, סדר, משך לכל פריט                                  | Widgets ומעברים מתקדמים (שלב 5)             |
| ‏Manifest v1 לכל מסך (Layout מסך מלא מובלע)                                                      | תזמון לפי שעות וימים (שלב 6)                |
| נגן Web ‏(PWA): Cache מקומי, אימות sha256, ניגון רציף, Offline, Heartbeat, WebSocket             | עטיפות נייטיב: Pi, Android, Windows (שלב 8) |
| ‏Proof-of-play: לא בשלב זה                                                                       | שלב 7                                       |

**הערה על Layout מובלע:** הנגן כבר עובד מול סכמת ה-Manifest המלאה (layouts, zones, schedule). בשלב זה השרת מייצר Layout אחד במסך מלא עם אזור אחד שמנגן את הפלייליסט של המסך, כך שלא יידרש שכתוב בשלב 5.

## 2. זרימת חיבור מסך (Pairing)

```mermaid
sequenceDiagram
  participant P as נגן (מסך חדש)
  participant S as שרת
  participant U as עורך/ת ב-CMS
  P->>S: POST /player/v1/pair/start
  S-->>P: { code: "K7Q-29M", pollToken } (תוקף 10 דק')
  P->>P: מציג את הקוד בגדול
  U->>S: POST /api/v1/orgs/:orgId/screens { code, name }
  S->>S: יוצר מסך + deviceToken (נשמר כ-hash; עותק מוצפן זמני למסירה)
  P->>S: POST /player/v1/pair/status { pollToken } (כל 3 שניות)
  S-->>P: { status: "paired", deviceToken } — פעם אחת בלבד, ואז נמחק
  P->>S: Bearer deviceToken → manifest, media, heartbeat, WebSocket
```

**אבטחת החיבור:**

- **הקוד:** 6 תווים מאלפבית בלי תווים דומים (‏~887 מיליון צירופים). חד-פעמי, תוקף 10 דקות, Rate limit לפי IP וליצירת מסכים לפי משתמש.
- **‏`pollToken`:** 256 ביט. רק המכשיר שהתחיל את החיבור יכול לקבל את ה-token.
- **‏`deviceToken`:** 256 ביט. ב-DB נשמר רק sha256 שלו. ניתוק מסך ב-CMS מבטל את ה-token מיד, והנגן חוזר למסך החיבור.
- **‏WebSocket:** האימות נעשה בהודעה הראשונה ולא ב-URL, כדי שה-token לא יירשם בלוגים.

## 3. מודל נתונים (Migration `0003_screens_playlists`)

- **`playlists`:** ‏`id`, `org_id`, `name`, תאריכים.
- **`playlist_items`:** ‏`playlist_id`, `position`, `media_id` (נמחק אוטומטית כשהמדיה נמחקת), `duration_ms` (‏null = ברירת מחדל: 10 שניות לתמונה, אורך הסרטון לווידאו).
- **`screens`:** ‏`id`, `org_id`, `name`, `token_hash`, `playlist_id`, `orientation`, `timezone`, `last_seen_at`, `player_version`, `resolution`, `manifest_version`.
- **`pairing_codes`:** ‏`code_hash`, `poll_token_hash`, `device_token_enc` (מוצפן, נמחק אחרי המסירה), `screen_id`, `expires_at`.

## 4. API

**CMS** (תחת `/api/v1/orgs/:orgId/`):

| Endpoint                                                                                      | הרשאה  |
| --------------------------------------------------------------------------------------------- | ------ |
| `GET screens`                                                                                 | VIEWER |
| `POST screens` (קוד חיבור + שם) · `PATCH screens/:id` · `POST screens/:id/reload`             | EDITOR |
| `DELETE screens/:id` (ניתוק)                                                                  | ADMIN  |
| `GET playlists` · `GET playlists/:id`                                                         | VIEWER |
| `POST playlists` · `PATCH playlists/:id` · `PUT playlists/:id/items` · `DELETE playlists/:id` | EDITOR |

**נגן** (`/player/v1/`, ‏Bearer deviceToken, בלי Cookies):

| Endpoint                               | תיאור                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST pair/start` · `POST pair/status` | ציבורי, עם Rate limit                                                                 |
| `GET manifest`                         | ‏ETag / `304 Not Modified`                                                            |
| `GET media/:id`                        | רק מדיה של הארגון של המסך, במצב `ready`. עם Range                                     |
| `POST heartbeat`                       | גרסת Manifest, גרסת נגן, רזולוציה                                                     |
| `GET ws` (WebSocket)                   | אירועים: `manifest.changed`, `reload`. ב-Scale-out האירועים עוברים דרך Valkey pub/sub |

## 5. הנגן (`apps/player`)

- **TypeScript בלי Framework.** קל מספיק ל-Raspberry Pi ולטלוויזיות חכמות. מוגש מ-`/player/` ע"י Caddy.
- **מצבים:** ‏`pairing` → ‏`loading` → ‏`playing`. בנוסף `offline` (מנגן מה-Cache) ו-`empty` (אין תוכן משויך).
- **Cache:**
  - ה-Manifest נשמר ב-`localStorage`.
  - קבצי המדיה נשמרים ב-Cache Storage, וכל קובץ נבדק מול sha256 לפני שמירה.
  - קבצים שכבר לא בשימוש נמחקים.
  - הנגן מבקש אחסון קבוע (`navigator.storage.persist()`), כדי שהדפדפן לא ימחק את ה-Cache.
- **Service Worker** שומר את קבצי הנגן עצמו, כך שהנגן נטען גם אחרי אתחול בלי רשת.
- **ניגון:**
  - תמונה מוצגת לפי המשך שנקבע.
  - וידאו מתנגן `muted` + `playsinline` עד הסוף.
  - מעבר fade שמכבד `prefers-reduced-motion`.
  - כיוון המסך מסובב ב-CSS לפי ה-Manifest.
  - הסמן מוסתר.
- **עמידות:**
  - ‏Backoff מעריכי בכשלי רשת.
  - Watchdog: וידאו שלא מתחיל תוך 10 שניות מדולג.
  - כשלי פענוח מדלגים לפריט הבא.
  - כשהמסך מנותק (401), ה-Cache נמחק והנגן חוזר למסך החיבור.

## 6. אבטחה

- **CSP לנגן:**
  - ‏`default-src 'self'`, ‏`img-src 'self' blob:`, ‏`media-src 'self' blob:`.
  - ‏`connect-src 'self' wss://{host}`, ‏`frame-ancestors 'none'`.
- **ה-Manifest נבדק בנגן** (`parseManifest`) לפני כל שימוש. תוכן שלא עבר בדיקה לא יוצג.
- **שלמות:** כל קובץ מדיה נבדק מול sha256 מה-Manifest, כך שקובץ שהשתנה בדרך נדחה.
- **ה-deviceToken נשמר ב-`localStorage` של הנגן.** המכשיר מיועד להצגה בלבד. ‏**סיכון ידוע:** הנגן וה-CMS באותו origin. מומלץ לא להתחבר ל-CMS מאותו דפדפן קיוסק.

## 7. CMS

- **מסכים (`/orgs/:orgId/screens`):**
  - רשימה עם סטטוס בטקסט ("מחובר" / "לא מחובר מאז…"), פלייליסט ורזולוציה.
  - "הוספת מסך" (קוד + שם), עריכה, Reload וניתוק עם אישור.
- **פלייליסטים (`/orgs/:orgId/playlists`):**
  - רשימה ויצירה.
  - עורך: הוספה מספריית המדיה (רק קבצים במצב "מוכן"), סידור בכפתורי "למעלה" ו"למטה" (נגיש במקלדת, בלי גרירה בלבד), משך לכל תמונה, הסרה ושמירה.

## 8. בדיקות

- **Integration:**
  - חיבור מלא, כולל קוד פג תוקף, קוד שגוי, Rate limit ומסירה חד-פעמית.
  - ‏Manifest תקין לפי הסכמה, ‏ETag ו-304.
  - גישה למדיה מארגון אחר → 404. מסך מנותק → 401.
  - ‏WebSocket מקבל `manifest.changed` אחרי שינוי פלייליסט.
  - IDOR על מסכים ופלייליסטים.
- **נגן (jsdom):** מכונת המצבים, Cache עם אימות sha256, רצף ניגון עם שעון מדומה, חזרה ממצב Offline.
- **‏E2E:** פלייליסט ב-CMS → פתיחת הנגן בהקשר דפדפן נפרד → הקוד מוצג → חיבור ב-CMS → הנגן מציג את התמונה. שינוי פלייליסט → הנגן מתעדכן בלי רענון. ‏axe על המסכים החדשים.

---

## 9. תוצאות ✅

### בדיקות

| סוג                                                                      | תוצאה                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| שרת (כולל Integration עם PostgreSQL, Valkey, SeaweedFS ו-ClamAV אמיתיים) | **154/154**                                                                                                                                                                                                    |
| ‏Pairing ו-API של הנגן                                                   | קוד חד-פעמי (lowercase ובלי מקף מתקבל), קוד שפג תוקפו, מסירת token פעם אחת, Rate limit (21 → 429), Manifest תקין לפי הסכמה, ETag/304, מדיה שנמחקה או לא מוכנה מסוננת, מדיה מארגון אחר → נדחית, מסך מנותק → 401 |
| ‏WebSocket                                                               | ‏`hello` → ‏`manifest.changed` (אחרי שינוי פלייליסט) → ‏`reload` → ‏`revoked` + close 4401. אימות שגוי → 4401                                                                                                  |
| נגן (jsdom)                                                              | **20/20**: לוח זמנים לפי אזור זמן (כולל חלון שחוצה חצות), פלייליסטים מקוננים, Cache עם sha256 (קובץ שהשתנה נדחה), Offline boot, ביטול → איפוס, החלפת תוכן אחרי אירוע                                           |
| CMS                                                                      | **27/27** בדיקות רכיבים                                                                                                                                                                                        |
| ‏E2E (Stack מלא, שני הקשרי דפדפן)                                        | **8/8**. המסע של הנגן: העלאה, פלייליסט, קוד שמוצג בנגן, חיבור ב-CMS, תמונה מוצגת (‏naturalWidth=4), סטטוס "מחובר", **ניתוק רשת ואתחול → ממשיך לנגן**, ריקון פלייליסט → "אין תוכן" בזמן אמת, ניתוק → חזרה לקוד  |
| נגישות (axe-core)                                                        | **0 הפרות** ב-20 מסכים ומצבים (כולל מסכים, פלייליסטים ועורך הפלייליסט)                                                                                                                                         |

### באגים שנמצאו ותוקנו

1. **Rate limit קרס בלי `request.ip`** (‏Unix socket / שדרוג WebSocket מוזרק). הוקשח עם `keyGenerator` ו-`clientIp()` עם ברירת מחדל.
2. **ריסטארט לפלייליסט בכל סנכרון:** אם proxy מסיר את ה-ETag והשרת מחזיר 200 עם אותה גרסה, הנגן היה מתחיל את הפלייליסט מההתחלה. מעכשיו גרסה זהה נחשבת "ללא שינוי".
3. **‏Service Worker לא שמר את האפליקציה בטעינה הראשונה:** הנגן לא היה עולה Offline עד הטעינה השנייה. מעכשיו index.html וה-assets נשמרים מראש בהתקנה (precache).
4. **נגישות (WCAG 2.5.3, Label in Name):** הטקסט הגלוי של כפתור "הוספה" לא הופיע בשם הנגיש שלו. תוקן.

### מגבלות ידועות

- **‏Service Worker דורש תעודה תקינה:** Chrome לא רושם Service Worker על תעודה לא מאומתת. ב-`localhost` עם תעודת Caddy המקומית הנגן עובד, אבל בלי Offline boot. עם Let's Encrypt זה תקין. בבדיקות E2E משתמשים בדגל `--ignore-certificate-errors`.
- **ה-token של המסך ב-`localStorage`** חולק origin עם ה-CMS (ראו סעיף 6).
- **שיוך מסך:** כרגע לפלייליסט אחד בלבד. Layouts עם אזורים ו-Widgets יגיעו בשלב 5, ותזמונים בשלב 6.
- **Proof-of-play עדיין לא נאסף** (שלב 7).
