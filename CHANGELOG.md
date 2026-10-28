# Changelog

All notable changes to Rubinny. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x: anything may still change).

## [Unreleased]

### Fixed

- Meeting rooms: a meeting that already started can be renamed or extended in the dashboard
  (it was refused as "starting in the past"); "Book now" right after "End the meeting now"
  no longer reports the room as busy; a screen whose room was deleted says the room is not
  available instead of showing its last status and "Book now".
- Events calendar: daily and weekly series that started years ago reach today again (they
  could use up the expansion budget before the window), today's all-day events stay until
  the end of the day in time zones west of UTC, and an event ending at midnight shows on its
  own day only in the week view. A calendar's time zone definitions apply to that calendar
  only (they could change the times of other organizations' calendars on the same server).
- Booking at a screen: attempts count against the limits before anything else is done, and
  room changes reach screens in one pass (in parallel) instead of one by one.

## [0.8.0] - 2026-10-28

Meeting rooms with booking at the screen, an events calendar, a building directory and
synagogue times, with two new starter kits. Upgrading from 0.7.1: see
[docs/UPGRADING.md](docs/UPGRADING.md#071--080) (one database extension).

### Added

- Meeting rooms (docs/phases/18-rooms-directory-calendar-zmanim.md):
  - a "Meeting rooms" page: rooms with location and seats, a day board, booking in a form
    (any member; members change their own bookings, admins anyone's), "only my bookings";
  - two bookings of a room can never overlap, even at the same moment (a database
    constraint); bookings last up to 12 hours and are deleted 90 days after they end;
  - a "Meeting room" widget for the screen next to a room: free or busy (in words, an icon and
    a color), until when, the next meetings; it updates at once when a booking changes;
  - on touch screens, "Book now" for 15, 30 or 60 minutes and "End the meeting now", with the
    organization's PIN (4–8 digits, stored hashed; 5 wrong tries lock that screen for 15
    minutes; failures are in the audit log). Screens never show who booked, and meeting
    titles only when the room allows it.
- An "Events calendar" widget: upcoming events from a public iCal link (Google Calendar,
  Outlook and others; `webcal://` links too), as a list by day or a week. The server fetches
  the calendar every 10 minutes (with the same protections as feeds) and expands recurring
  events with their exceptions and cancellations, in the calendar's time zones; screens get
  only each event's title, time and place.
- A "Building directory" widget for lobbies: companies, departments and services by floor and
  room, sorted by name, with an arrow and the floor's map (an image from the media library).
  Touch screens filter by floor and category and open an entry's details; left alone, the
  screen goes back to the full list, and long lists turn their pages by themselves. Names of
  people are personal data shown in public: the editor says to add them only with consent.
- A "Synagogue times" widget: the Hebrew date, the week's Torah portion, holidays and Rosh
  Chodesh, times of the day (dawn to nightfall, by the GRA and the Magen Avraham), the
  congregation's prayers at fixed times or relative to a time of the day, on chosen days, with
  the next time marked, and the coming candle lighting and havdalah. Computed on the server
  with `@hebcal/core` (the engine behind hebcal.com; no outside service); screens get two
  weeks ahead and keep showing correct times offline. The editor starts from a list of cities,
  and the screen names the method used. Times should be confirmed with the congregation's
  rabbi before publishing.
- Two starter kits: "Synagogue" (times and prayers, clock, classes, notices) and "Meeting
  room" (the room's screen; it uses the organization's first room, or, for admins, adds one).

### Security

- Electron 44.10.0 for the desktop player (CVE-2026-115570 in 44.9.0).
- The web image: Caddy built with go-jose 4.1.6 (CVE-2026-116587), and the base image's
  packages upgraded (brotli CVE-2026-111497, curl CVE-2026-92392).

### Upgrading

- The database needs the PostgreSQL extension `btree_gist` (in the standard contrib modules,
  included in the official images). With a managed database where the server's user cannot
  create extensions, run `CREATE EXTENSION btree_gist;` once as an administrator before
  upgrading (docs/UPGRADING.md).

## [0.7.1] - 2026-10-23

The attribution "Powered by Rubinny · Open source" in every part of Rubinny, fixes, and updated
dependencies. Upgrading from 0.7.0: see [docs/UPGRADING.md](docs/UPGRADING.md#070--071)
(nothing to do).

### Added

- The attribution "Powered by Rubinny · Open source" ("מופעל על ידי Rubinny · קוד פתוח") in
  every part of Rubinny, from one source (`packages/shared/src/attribution.ts`):
  - a header in every source file (copyright, creator, SPDX license, source link), checked in CI
    by `pnpm attribution`;
  - a notice at the top of every built JS and CSS file of the dashboard and the player, checked
    after the build;
  - the dashboard: the footer of every page, a new About page (`/about`) with the version,
    license and source code, and a `generator` meta tag;
  - the player: the pairing, loading and "nothing to show" screens (never over the content an
    organization shows), and a line in the browser console;
  - the desktop, Android and Samsung/LG apps: their setup screens (and the desktop's About
    panel);
  - the server: an `X-Powered-By: Rubinny (open source)` header on every response (no version),
    a public `GET /api/v1/about`, and a line in the server and worker logs;
  - the Docker images: OCI labels (license, source, author).
- The license's attribution term (LICENSING.md, AGPL-3.0 section 7(b)) covers all of these.

### Fixed

- The screen page showed a technical zone id ("Zone 81884cf8-…") under "Showing now"; it shows
  the zone's name, or no zone for a playlist alone.
- Creating a starter kit while the media storage is down took minutes (each picture waited for
  its retries); the kit is now created at once, without its pictures.
- The designer drew a grey box behind transparent pictures (the kits' illustrations); it shows
  the canvas behind them, like the screens do.

### Changed

- The dashboard pictures in the READMEs are taken on a demo installation by
  `pnpm --filter @rubinny/cms screens`, in Hebrew and English (new: the menu editor, the kits and
  the About page).
- Building from source needs Node.js 22.22.2 or later (or 24.15 or later), for jsdom 30 in the
  tests. The Docker images are not affected.
- Updated dependencies: react-router 8.5, i18next 26.5, react-i18next 17.1, TanStack Query
  5.104.4, Kysely 0.29.7, BullMQ 6.3.17, nodemailer 10.1.7, lucide-react 1.59, the Anthropic
  SDK 0.135, jsdom 30 and development tools.

## [0.7.0] - 2026-10-22

Screens that look professionally designed: seven starter kits by trade with original art, a
menu / price list widget, and a designer with gradients, shadows, fonts and animations.
Upgrading from 0.6: see [docs/UPGRADING.md](docs/UPGRADING.md#06--07) (nothing to do; screens
update their player on their own).

### Added

- Starter kits by trade, in Hebrew and English: restaurant, café, cinema, retail, office,
  hotel and community center. Each one creates designed slides, a menu or schedule, a ticker
  and, where it fits, a clock, a countdown or a QR code, on the new "showcase" template (a
  main zone, a side zone and a ticker). The kits page groups them "By trade" and "General",
  with a picture of each.
- Rubinny Art Pack: 18 original illustrations and backgrounds (CC0) used by the kits. When a
  kit is created they go through the normal media pipeline, scan included, and are stored
  once per organization. Without media storage, kits are created without pictures.
- Menu / price list widget: sections and items (name, description, price, tags such as vegan,
  spicy, new or recommended), 1 to 3 columns, modern, classic or chalkboard style, and prices
  in shekels, dollars, euros or pounds formatted for the language (or plain text, for times).
  Edited in an accessible section editor. Needs the 0.7 player.
- Designer: linear and radial gradients, shadows and glows, colors with transparency,
  outlined text, letter spacing, capitals, a color overlay on pictures, alternative text,
  the vertical position of text in its box, and entrance and looping animations per element
  (a design can switch them off, and screens that ask for reduced motion never play them).
- Four fonts besides Heebo, bundled with the player (no third-party requests): Rubik, Frank
  Ruhl Libre, Secular One and Bebas Neue (Latin only; Hebrew falls back to Heebo).
- Designer templates "Special of the day" and "Premiere".
- Screens update themselves after a server upgrade: a player older than the server is asked to
  reload (at most every 10 minutes), so it never runs older code than the content needs.
- `apps/showcase`: a development tool that takes the kit pictures for the READMEs and the
  dashboard with the player's own code.

### Changed

- Designs can be as small as 100 px on each side (was 320), for headers and strips.
- New README introduction and gallery of the kits, in both languages.

## 0.6.0 - 2026-10-21

Time windows for playlist items, screen groups, a time zone per screen, a server status page
for the operator, and Samsung and LG screens (not yet verified on a device). 0.5.0 was
prepared but not published; this release replaces it. 0.6.0 itself was not published as a
release either: its changes are in 0.7.0.
Upgrading from 0.4: see [docs/UPGRADING.md](docs/UPGRADING.md#04--06) (usually nothing to do).

### Added

- Samsung (Tizen, 2020 and newer) and LG (webOS Signage 6.0 and newer) screens: the player now
  runs on Chromium 69, and each release carries small loader apps for both
  (`rubinny-tv-tizen-<version>-unsigned.wgt`, which the operator signs, and
  `rubinny-tv-webos-<version>.ipk`). The loader asks for the server address once (https only),
  then opens the server's player; usable with a TV remote. Guide in
  [docs/players.md](docs/players.md#samsung-and-lg-screens). Not yet verified on a real screen.
- Time windows for playlist items: each item can be limited to dates, days of the week and
  hours ("lunch menu, Sunday to Thursday, 11:30-13:30"). The screen decides on its own clock
  and time zone, so it works offline; an item whose last date has passed is no longer sent to
  screens. The playlist editor shows each window in words ("Scheduled: ...", "Ended") and
  edits it with labelled fields. Needs the 0.6 player (older players show every item).
- Screen groups: name a group of screens ("Floor 2") and give all of them a layout, playlist
  or schedule at once ("Assign content"); filter the list of screens by group. A screen can
  be in several groups. Assigning content waits for an admin when the organization requires
  approval, and an approval covers the screens that were in the group when the editor asked;
  naming groups and choosing their screens does not wait.
- A screen's time zone can be chosen in "Edit screen" (it was fixed to Asia/Jerusalem).
  Schedules and time windows follow it; the screen updates at once.
- Server status page for the operator of the installation: services, antivirus signature
  age, the last backup (recorded by `backup.sh`), disk, media processing, outgoing mail and
  usage counts, each as OK / Needs attention / Problem in words. The first setup's account
  is the operator (after upgrading, the oldest account); more only with
  `deploy/set-operator.sh`. Needs two-step verification; hidden (404) from everyone else.

### Changed

- The player is built for Chromium 69 (it needed about Chromium 80): syntax is lowered, two
  missing built-ins are added, and CSS sizes have fallbacks. CI checks the built player for
  syntax and browser APIs that Chromium 69 lacks.

## [0.4.1] - 2026-10-18

Fixes for content approval and privacy. Upgrading from 0.4: nothing to do (no migrations).

### Fixed

- Content approval: when a member leaves the organization, is removed or deletes their
  account, their pending requests are withdrawn, so they cannot be approved by mistake later.
- "Download my data" now includes the approval requests you made or decided (summary,
  status, dates and note; not the change itself).
- The cookie policy draft lists the SSO sign-in cookie (`__Secure-rubinny_oidc`, essential,
  deleted when sign-in ends).

## 0.4.0 - 2026-10-18

Touch screens, video walls and writing suggestions with the organization's own AI key.
Not published as a release of its own: its changes are in 0.4.1.
Upgrading from 0.3: see [docs/UPGRADING.md](docs/UPGRADING.md#03--04) (usually nothing to do).

### Added

- Touch screens: a zone of a layout can open another layout of the organization or go back
  when tapped (or with Enter/Space, for keyboards and switches); after a set time without a
  touch the screen returns to its scheduled content. No touches are recorded. Tapped zones
  are named buttons for screen readers, with a visible focus ring. See
  docs/phases/12-touch-wall-ai.md.
- Video walls: screens marked as a wall (columns × rows, their cell and the frame width)
  show one layout over the whole wall, each its own part; what plays is computed from the
  corrected server clock, so all screens switch together and videos join mid-way in step.
  Accuracy on real hardware still needs testing (no frame-exact sync).
- Writing suggestions (AI, bring your own key): off by default; an admin turns it on with the
  organization's own Anthropic API key (checked, stored encrypted, never shown again) after an
  explicit notice that texts go to an outside provider. Editors get "suggest wording" and
  "translate" next to text widgets and alert messages; the suggestion is shown and used only
  if they choose. Prompts and answers are not stored or logged. Uses the official
  `@anthropic-ai/sdk`. Sending content to an AI provider requires legal review (DPA,
  transfers abroad).

## 0.3.0 - 2026-10-16

Sign-in through the organization (SSO) and content approval. Upgrading from 0.2: see
[docs/UPGRADING.md](docs/UPGRADING.md#02--03) (usually nothing to do). Not published as a
release of its own: its changes are in 0.4.1.

### Added

- Content approval: when an organization turns it on, an editor's change to what screens
  show is checked in full, then waits for an admin; approving applies it at once (and tells
  the screens), rejecting keeps a note for the editor. Admins are e-mailed. Emergency alerts
  never wait. See docs/phases/11b-approvals.md.
- Sign-in through the organization (SSO, OpenID Connect): Google Workspace, Microsoft Entra
  ID, Keycloak or any OIDC provider, configured with `OIDC_*` in `.env`. Authorization Code
  with PKCE, users matched by the provider's subject or once by a verified e-mail address,
  invitations respected, local two-factor authentication still applies. Linked accounts are
  listed (and can be unlinked) on the account page. See docs/OPERATIONS.md (SSO).

### Security

Found in an internal review before release (none of these reached a released version):

- SSO: signing in through the provider to an account whose address was never verified now
  takes it over cleanly (the previous password, two-factor setup, recovery codes, links and
  sessions stop working), so whoever registered the address first keeps no access.
- SSO: the sign-in state cookie is named `__Secure-` (a `__Host-` cookie needs `Path=/`,
  so browsers refused it and SSO failed on every https server).
- Approvals: approving claims the request first and applies the change without holding a
  database connection, so many approvals at once cannot exhaust the pool; a change that fails
  to apply always stays pending, also without row-level security.
- Requests aborted by the client roll back their transaction, and a handler still running
  cannot continue outside it. The database pool now times out waiting for a connection
  (10 s), and PostgreSQL ends a transaction left idle for 60 s.
- Approvals: in an organization that requires approval, editors pair new screens without
  content (assigning it is a change that waits for an admin).

## [0.2.0] - 2026-10-16

Data tables, emergency alerts, row-level security and arm64 images. Upgrading from 0.1: see
[docs/UPGRADING.md](docs/UPGRADING.md#01--02) (usually nothing to do).

### Added

- Data table widget: menus, price lists and timetables from Google Sheets, CSV or JSON,
  fetched by the server (SSRF-safe), cached, paged on the screen and refreshed on their own
  (see docs/phases/10a-data-table.md).
- Emergency alerts: one click shows an emergency or urgent notice over everything on all or
  chosen screens within seconds (before any media download), until ended or for a set time,
  also offline; ready templates (evacuation, shelter, lockdown), confirmation, audit log
  (see docs/phases/10b-emergency-alerts.md).
- Row-level security in PostgreSQL: requests to an organization's data run as a restricted
  role that only sees and changes that organization's rows, even if a query forgets to filter
  (see docs/OPERATIONS.md, database isolation).
- Images for arm64 as well as amd64 (Raspberry Pi 5, Apple Silicon, ARM cloud servers): built,
  scanned and signed for both; checked in CI under emulation.
- Credit: "Created by Diamond Rubinny" in the dashboard footer, README, NOTICE, a new
  AUTHORS.md, and the desktop app's author and package maintainer.

### Changed

- Screen notifications and worker jobs are sent only after the change is saved, so a screen
  never fetches content before it is visible.
- The server keeps up to 20 database connections by default (`DATABASE_POOL_MAX`, was 10).
- `CLAMAV_IMAGE` selects the ClamAV image (on arm64: `clamav/clamav-debian:stable`).

### Known limitations

- Installers are not code-signed (Windows SmartScreen warns; the Android APK is a debug build).
- Not tested yet on physical Raspberry Pi, Android TV, Windows or ARM server hardware, nor
  against a real Google Sheet.
- Organization routes of the dashboard serve 20–30% fewer requests per second with row-level
  security (measured; screens are not affected).

## [0.1.0] - 2026-10-16

The first release: a complete, self-hosted digital signage system. Not yet reviewed by an
external penetration tester, accessibility auditor or lawyer: see
[docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) before using it in production.

### Dashboard (CMS)

- Organizations, roles (owner, admin, editor, viewer), invitations, two-factor
  authentication, sessions, audit log, data export and account deletion.
- Media library with quarantine, ClamAV scanning, re-encoding and metadata removal.
- Playlists, layouts with zones, built-in widgets (clock with the Hebrew date, text, ticker,
  QR code, RSS, weather, web page, countdown), a free-form designer, starter kits, and a
  free image library (public domain/CC0).
- Scheduling by days, hours and dates with priorities and a weekly timeline.
- Operations: what each screen shows now, uptime, clock check, offline e-mail alerts,
  proof-of-play reports with CSV export, remote screenshots.
- Hebrew and English, right to left, keyboard accessible, dark mode, accessibility menu.

### Screens

- Offline-first web player (PWA) with verified media cache and live updates.
- Desktop app for Windows and Linux (Electron), Raspberry Pi kiosk installer, and an
  Android / Android TV app; the apps start with the device, stay full screen, recover from
  crashes and send real screenshots.

### Operations and security

- Docker Compose deployment with automatic HTTPS (Caddy), PostgreSQL 18, Valkey 9, SeaweedFS
  and ClamAV; isolated networks, read-only containers, no capabilities.
- Encrypted backups and verified restores (`deploy/backup.sh`, `deploy/restore.sh`), tested
  end to end in CI.
- Tenant isolation enforced at startup and tested on every route with an id.
- CI: lint, type checks, unit and integration tests, end-to-end and accessibility tests
  (axe, keyboard only, reflow at 320 px, dark mode, reduced motion), secret scanning
  (gitleaks), dependency and image scanning (Trivy), SBOMs (CycloneDX), a passive dynamic
  scan (OWASP ZAP), CodeQL, and device tests of the Android app on an emulator.
- Release images are signed with Sigstore cosign (keyless) and carry build provenance.
- Rate limits per verified screen and session, so many screens and staff behind one school
  network address do not share one budget. Measured on a 4-core test machine: manifest
  886 req/s (p99 97 ms), heartbeat 616 req/s (p99 122 ms), about 18,000 screens per server
  process at one heartbeat every 30 s.

### Known limitations

- Installers are not code-signed (Windows SmartScreen warns; the Android APK is a debug build).
- Images are built for x86-64 (amd64) only.
- Not tested yet on physical Raspberry Pi, Android TV or Windows devices.
- Row-level security in PostgreSQL is planned for 0.2 (see docs/phases/09-release.md).

[0.8.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.8.0
[0.7.1]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.7.1
[0.7.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.7.0
[0.4.1]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.4.1
[0.2.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.2.0
[0.1.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.1.0
