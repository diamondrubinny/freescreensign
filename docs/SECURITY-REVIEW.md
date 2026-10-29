# Internal security review (0.11.0)

[סיכום בעברית למטה](#סיכום-בעברית)

**Date:** October 2026. **Version reviewed:** 0.10.0 (the fixes ship in 0.11.0).
**Plan:** [docs/phases/21-security-review.md](phases/21-security-review.md).

**This is not a penetration test.** It was done by the people who wrote the code, who miss
what they never thought of. An external penetration test is still required before v1.0
([PLAN.md](PLAN.md)). Nothing here states compliance with a standard or a law.

## Summary

| Severity | Found | Fixed in 0.11.0 | Accepted or left for later |
| -------- | ----- | --------------- | -------------------------- |
| Critical | 0     | —               | —                          |
| High     | 1     | 1               | —                          |
| Medium   | 9     | 9               | —                          |
| Low      | 16    | 9               | 7 (listed below)           |

No route answered the wrong caller: the authorization matrix (below) found no gap in who may
call what. The findings are in what an allowed caller can make the server do: hostile
input that blocks the event loop, answers that tell whether an address has an account,
counters that can be gamed, and media tools that ran with more than they needed.

Every fix has a test that fails on the code before it (one exception, noted at A1). None of
the findings is known to have been used against a real installation.

## Scope and method

- **Code:** the server (API, player API, integrations API, media worker), the dashboard and
  the player of release 0.10.0. The wrappers (Electron, Android, Raspberry Pi,
  Tizen, webOS) were reviewed only for how a screen is set up (C6).
- **Checklist:** [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/),
  level 2, as a guide to what to look at, not as a claim of conformance.
- **Access policy for every route** (`apps/server/test/security/route-policy.ts`): who may
  call each of the server's routes (organization role, signed in, screen, API key scope,
  operator, or public with a reason). A test fails if a route is added without a policy, or
  if a route's guard asks for a different role than the policy.
- **Authorization matrix** (`apps/server/test/security/authorization.test.ts`), generated
  from that table, on every commit:
  - organization routes: 401 signed out, 404 for a member of another organization and for an
    unknown organization, 403 one role below the one required;
  - signed-in routes: 401 signed out;
  - screen routes: 401 without a token, with a wrong one, and with an API key;
  - integration routes: 401 without a valid key or with a user's session, 403 with a key
    without the scope;
  - the operator page: 401 signed out, 404 (hidden) for anyone but the operator;
  - public routes: never a server error on an empty request.
- **Manual review by area:** sign-in, sessions, SSO, two-step verification and password
  reset; every outgoing request (SSRF); file uploads and the media worker; the player
  websocket and room booking on touch screens; rate limits; parsing of feeds, calendars and
  tables; security headers.
- **Dynamic scans (OWASP ZAP 2.16.1):**
  - on every commit (CI, after the end-to-end tests): the baseline scan of the dashboard, and
    a passive scan of every API route, signed in, from an OpenAPI description generated from
    the access policy table (`apps/server/test/security/openapi.ts`). The signed-in user is
    the end-to-end tests' teacher (a viewer by then): the admin of those tests has two-step
    verification with a secret that only the test knows;
  - weekly and on demand (`.github/workflows/zap-active.yml`): the **active** scan (SQL
    injection, XSS, path traversal, command injection and the rest) of every route with an
    admin session, on a throwaway stack built from the commit. It fails on High alerts.
  - Result of the first active scan: no Medium or High alert. Low alerts: HSTS is off on the
    test stack (it is on by default in production), `X-Powered-By` carries the project's
    attribution notice on purpose ([LICENSING.md](../LICENSING.md)), and the stock image
    routes answered 502 because the test stack cannot reach the image library.
- **Dependencies:** `pnpm audit` found advisories in `fast-uri` (below). Trivy, CodeQL and
  gitleaks run in CI as before.

## Severity

- **Critical:** takes over the server or another organization's data without credentials.
- **High:** a single request from a low-privilege user (or anyone) makes the service
  unavailable, or exposes another user's data.
- **Medium:** a weakness that helps an attack (account discovery, account pre-hijacking,
  guessing, a secret within reach of a vulnerable tool) or blocks the service for a while.
- **Low:** defense in depth, or an attack that needs an unusual position.

## Findings fixed in 0.11.0

### High

**B1. A calendar feed could freeze the server.** _(Calendar widget, `widgets/calendar.ts`)_
An editor could point a calendar widget at an ICS file with a recurrence rule that never
matches, such as `FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30`. The calendar library then looked for
the next occurrence forever, on the server's only thread: the API stopped answering, and did
so again after each restart, until the widget was removed from the database.
**Fix:** the work of expanding recurrences is counted, and a feed that needs more than
100,000 candidate dates is refused as invalid (a normal calendar needs a few hundred).
**Test:** `test/widgets/calendar.test.ts` (that rule and an hourly variant finish within
5 seconds).

### Medium

**A1. Password reset and resending the verification e-mail took longer for an existing
address.** _(`auth/routes.ts`)_ The answer waited for the e-mail to be sent, so its timing
told whether the address had an account. Registering differed the same way: a new address
waited for its verification e-mail, an existing one for none.
**Fix:** in all of these the answer is sent first, and the e-mails afterwards.
**Test:** `test/api/setup-auth.test.ts` checks that the answers are the same and that the
e-mail still arrives. Timing itself is not measured in the test (it would be flaky in CI).

**A2. Registering told whether an address had an account.** _(`auth/routes.ts`)_ With open
registration and no e-mail verification, a new address got 201 (signed in) and an existing
one 202.
**Fix:** both get the same status. The owner of the existing address gets an e-mail.
**Test:** `test/api/setup-auth.test.ts`.

**A3. An unproven address counted as verified.** _(`auth/routes.ts`, `auth/oidc.ts`)_ When
e-mail verification was off, registration marked the address as verified. With SSO on, an
attacker could register the victim's address first, and the victim's later SSO sign-in was
linked to the attacker's account (account pre-hijacking).
**Fix:** an address is marked verified only when it was proven (by a link sent to it, or an
invitation delivered to it). Where the address need not be verified to sign in, registering
still sends the link, since alerts go only to verified addresses. An SSO sign-in to an
account whose address was never proven still resets that account's other credentials.
**Test:** `test/api/sso.test.ts`, `test/api/setup-auth.test.ts`.

**A4. Turning two-step verification on or off left other sessions as they were.**
_(`auth/routes.ts`)_ A session stolen before the owner turned it on stayed valid, and kept
admin rights.
**Fix:** both end every other session of the user.
**Test:** `test/api/mfa.test.ts`.

**C1. The limit on new pairing codes could be skipped.** _(`player/routes.ts`)_ The limit
matched the raw URL, so `/player/v1/pair/start?x` or a trailing slash was not counted.
**Fix:** the limit uses the matched route.
**Test:** `test/api/player.test.ts`.

**C2. A room's PIN could be guessed.** _(`rooms/player.ts`, `shared/rooms.ts`)_ PINs could
have 4 digits, and the organization's counter of wrong PINs was reset by a right one.
**Fix:** new PINs have 6 to 8 digits (existing shorter PINs keep working until changed).
Each screen's counter counts every attempt and resets on success. The organization's
counters (30 in 15 minutes, 100 a day) count only failures and are never reset by success.
**Test:** `test/api/rooms.test.ts`, `packages/shared/test/rooms.test.ts`.

**D1. The media tools ran with the server's secrets in their environment.**
_(`worker/exec.ts`)_ ffmpeg and ffprobe, which parse untrusted files, were started with the
worker's full environment: the database address, the storage keys and the encryption key.
A flaw in either tool would have reached them.
**Fix:** the tools get only `PATH`.
**Test:** `test/media/processors.test.ts`.

**D2. The storage quota could be passed by uploading in parallel, and there is no quota by
default.** _(`media/ingest.ts`)_ Each upload checked the space used, then stored the file;
parallel uploads all passed the check.
**Fix:** the check and the reservation run one upload at a time per organization (a
database lock). The default quota stays "no limit": the operator sets
`MEDIA_ORG_QUOTA_BYTES` ([PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)).
**Test:** `test/media/flow.test.ts` (parallel uploads: before, four passed a one-file quota;
now one).

**E1. A feed title could block the server for minutes.** _(`widgets/rss.ts`)_ Removing tags
from text used a pattern that is quadratic on a long run of `<`.
**Fix:** a linear pattern, on at most 8 KB of each field.
**Test:** `test/widgets/unit.test.ts` (1 MB of `<` within 500 ms).

### Low

**A5. No daily limit on wrong second-factor codes.** About 960 guesses a day were possible
within the existing limits. **Fix:** at most 30 wrong codes a day for a user, and the owner
gets an e-mail when it is reached. **Test:** `test/api/mfa.test.ts`.

**B2. Weather requests followed redirects.** **Fix:** they do not. **Test:**
`test/api/content.test.ts`.

**B3. Webhook errors told an internal address from an unreachable one.** An admin could map
the internal network through the "test" button and the last error. **Fix:** a refused
address reads as any failed connection; the real reason is in the server log.
**Test:** `test/api/integrations.test.ts`.

**C3. The player websocket accepted many sign-in messages before the first answer**, each a
database lookup. **Fix:** one per connection; a second closes it.
**Test:** `test/api/player.test.ts`.

**D3. ffmpeg and ffprobe chose the container format and protocols from the file.**
**Fix:** local files only, with the expected format given. **Test:**
`test/media/processors.test.ts`.

**D4. A file could hold the worker for long.** **Fix:** a 60 second limit on each image step
and at most 10 minutes for a video, whatever the file says about its length.
**Test:** `test/media/processors.test.ts`.

**D7. A download kept the extension the uploader chose.** **Fix:** the name's extension
follows the file's real type. **Test:** `test/media/unit.test.ts`.

**E2. API answers could be cached.** **Fix:** `Cache-Control: no-store` on every API answer
that does not set its own. **Test:** `test/api/setup-auth.test.ts`.

**F1. Dependency advisories in `fast-uri`** (GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr:
moderate; GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp: low), used by the JSON schema validator
of Fastify and electron-builder. The server defines no JSON schemas for its routes (input is
validated with zod), so no path to these was found. **Fix:** updated to
4.2.3 and 3.1.9.

## Accepted, or left for later

| #   | Finding                                                                                                                                                                     | Why it stays, and the mitigation                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A6  | Recovery codes have 50 bits and are stored as unsalted SHA-256.                                                                                                             | 50 random bits are out of reach online (sign-in is rate limited, and A5). Offline, with the database stolen, a code can be cracked; the attacker would also need the password. Longer codes later. |
| C4  | A screen can fetch any media file and any widget's data of its own organization, not only what it shows.                                                                    | The screen belongs to the organization; the token is a secret on the device. Limiting to the manifest is planned.                                                                                  |
| C5  | Proof of play reports are not checked against what the screen was sent, and their volume is limited only by the rate limit.                                                 | A stolen screen token can distort that screen's reports. Reports are statistics, not billing.                                                                                                      |
| C6  | On kiosk devices, a key or touch gesture opens the setup screen, where the server address can be changed.                                                                   | Needed for installation. Put devices where the public cannot reach the keys, and see [players.md](players.md).                                                                                     |
| D5  | Importing from the stock image library holds each image (up to the image size limit) in memory, with no limit on parallel imports beyond the per-user rate limit.           | Admins and editors only; rate limited. A limit on parallel imports later.                                                                                                                          |
| D6  | Screenshots from screens are decoded in the API process, not in the worker, and are not scanned by ClamAV.                                                                  | Only a paired screen can send them; JPEG or PNG only, at most 40 megapixels; re-encoded, and never served as uploaded.                                                                             |
| D8  | If ClamAV is down for more than about 75 seconds (5 attempts), uploads in that window fail and must be uploaded again; the file stays in quarantine until it is cleaned up. | Fails closed: an unscanned file is never served. Monitor ClamAV ([OPERATIONS.md](OPERATIONS.md)).                                                                                                  |

## For the external penetration tester

Worth a close look, in this order:

1. Organization isolation beyond the route level: data reached through ids inside request
   bodies (playlists that name media, layouts that name widgets, schedules that name
   screens), and the row-level security policies of the database.
2. SSO (OIDC) linking and the sign-in flows (A2, A3), on a real identity provider.
3. Everything that parses an upload: sharp (libvips), ffmpeg, ClamAV, inside the worker's
   container limits.
4. Outgoing requests (webhooks, feeds, calendars, tables, the AI provider, the image library):
   DNS rebinding and redirects against `safe-fetch`.
5. The wrappers: navigation away from the server, and the setup screen (C6).
6. The touch screen booking flow and room PINs on a real device.

Test accounts, the access policy table and the OpenAPI generator are in the repository; the
active scan workflow shows how to stand up a throwaway stack.

## סיכום בעברית

<div dir="rtl">

**מה נעשה:** סקירת אבטחה פנימית של גרסה 0.10.0 לפי ASVS 5.0.0 רמה 2, טבלת הרשאות לכל נתיב
עם מטריצת בדיקות שרצה בכל commit, וסריקות ZAP: פסיבית מאומתת בכל commit ואקטיבית בכל שבוע.

**מה נמצא:** אף נתיב לא ענה למי שאינו רשאי. נמצאו ממצא אחד בחומרה גבוהה (קובץ יומן ICS
שמקפיא את השרת), 9 בחומרה בינונית ו-16 בחומרה נמוכה. כל הממצאים בחומרה גבוהה ובינונית
תוקנו ב-0.11.0, כל אחד עם בדיקה שנכשלת על הקוד הישן. 7 ממצאים נמוכים נשארו, עם הסבר
והקלות (בטבלה למעלה).

**מה זה לא:** זו אינה בדיקת חדירות ואינה אישור עמידה בתקן או בחוק. לפני v1.0 נדרש
בודק חדירות חיצוני. רשימת הנושאים שכדאי שיבדוק נמצאת למעלה.

</div>
