# Rubinny

**Free & open-source digital signage that looks professionally designed.** Menus, showtimes,
sales, welcome screens, notice boards, synagogue times and meeting room screens for restaurants,
cafés, cinemas, shops, offices, hotels, community centers and synagogues: ready in one click, edited in a web dashboard, and played on any number
of screens. Self-hosted, offline-first, with Hebrew/RTL and accessibility built in. Runs on
anything with a modern browser: Raspberry Pi, Windows, Linux, Android / Android TV / Fire TV,
and Samsung (Tizen) and LG (webOS) screens (not yet verified on a device).

[עברית](README.he.md) · [Specification & roadmap](docs/PLAN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Sponsor](#support-the-project)

> **Status: actively developed (v0.9).** All nine planned phases are done, with releases since
> 0.1. It is ready to evaluate and pilot; before production use, go through the
> [production checklist](docs/PRODUCTION-CHECKLIST.md), which also lists what still needs a
> professional review.

![The restaurant kit on a screen: a menu with prices and dietary tags, a dish of the day with an illustrated plate, and a happy-hour ticker](docs/screenshots/kits/restaurant-en.webp)

▶ **30-second video:** [landscape](docs/video/rubinny-ad-en-16x9.mp4) ·
[vertical](docs/video/rubinny-ad-en-9x16.mp4) (Hebrew: [landscape](docs/video/rubinny-ad-he-16x9.mp4) ·
[vertical](docs/video/rubinny-ad-he-9x16.mp4))

## Ready for your venue

Pick your trade and get a finished screen in one click: designed slides, a menu or schedule,
a ticker and, where it fits, a clock, a countdown or a QR code. Every kit comes in Hebrew or
English, and every picture in it is original art drawn for the project
([Rubinny Art Pack](LICENSING.md), CC0). Change any text, price or color in the dashboard.

|                                                                                     Cinema                                                                                     |                                                                   Café                                                                   |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------: |
|                           ![Cinema: a "now showing" poster between red curtains and today's showtimes by hall](docs/screenshots/kits/cinema-en.webp)                           | ![Café: a chalkboard menu of coffee, pastries and breakfast, and a morning deal with a steaming cup](docs/screenshots/kits/cafe-en.webp) |
|                                                                                   **Retail**                                                                                   |                                                                **Office**                                                                |
|                           ![Retail: an end-of-season sale at -50% with a price tag, and a members club offer](docs/screenshots/kits/retail-en.webp)                            |      ![Office: a welcome screen with the company name, the guest Wi-Fi, a clock and notices](docs/screenshots/kits/office-en.webp)       |
|                                                                                   **Hotel**                                                                                    |                                                           **Community center**                                                           |
|                        ![Hotel: a welcome with check-in times, a reception bell and a clock with the Hebrew date](docs/screenshots/kits/hotel-en.webp)                         | ![Community center: a family festival poster with balloons and confetti, and an updates ticker](docs/screenshots/kits/community-en.webp) |
|                                                                                 **Synagogue**                                                                                  |                                                             **Meeting room**                                                             |
| ![Synagogue: the Hebrew date and weekly portion, times of the day and prayers with the next one marked, candle lighting and havdalah](docs/screenshots/kits/synagogue-en.webp) |    ![Meeting room: "Busy until 10:30" in red with the current meeting and the next ones](docs/screenshots/kits/meeting-room-en.webp)     |
|                                                                             **Closed on Shabbat**                                                                              |                                                                                                                                          |
|                   ![Closed on Shabbat: "Shabbat Shalom" with two lit candles, closed on Shabbat and holidays](docs/screenshots/kits/shabbat-closed-en.webp)                    |                                                                                                                                          |

<details>
<summary>The same kits in Hebrew</summary>

|   ![The restaurant kit in Hebrew](docs/screenshots/kits/restaurant-he.webp)    |          ![The cinema kit in Hebrew](docs/screenshots/kits/cinema-he.webp)           |
| :----------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
|         ![The café kit in Hebrew](docs/screenshots/kits/cafe-he.webp)          |          ![The retail kit in Hebrew](docs/screenshots/kits/retail-he.webp)           |
|       ![The office kit in Hebrew](docs/screenshots/kits/office-he.webp)        |           ![The hotel kit in Hebrew](docs/screenshots/kits/hotel-he.webp)            |
| ![The community center kit in Hebrew](docs/screenshots/kits/community-he.webp) |       ![The synagogue kit in Hebrew](docs/screenshots/kits/synagogue-he.webp)        |
| ![The meeting room kit in Hebrew](docs/screenshots/kits/meeting-room-he.webp)  | ![The closed on Shabbat kit in Hebrew](docs/screenshots/kits/shabbat-closed-he.webp) |

</details>

## Features

### On the screens

- **Offline-first web player** (PWA at `/player/`): pair with a 6-character code, then it keeps
  playing from a verified (sha256) local cache through network outages and reboots.
- **Live updates** over WebSocket — changes reach screens in seconds.
- **Players for every device** ([install guide](docs/players.md)): any browser, a desktop app
  for Windows and Linux, a Raspberry Pi kiosk installer, an Android / Android TV app, and loader
  apps for Samsung and LG screens. The
  desktop and Android apps start with the device, stay full screen, recover from crashes, and
  send **real remote screenshots** to the dashboard.
- **Layouts with zones**: each zone plays its own playlist (e.g. video + clock + ticker).
- **Built-in widgets**: clock with the Hebrew date, text, ticker (RTL-aware), QR code, RSS
  news, weather (opt-in), web page, countdown, **menus and price lists** (sections, prices in
  shekels, dollars, euros or pounds, tags like vegan, spicy or new, up to 3 columns, in modern,
  classic or chalkboard style), **data tables** (Google Sheets, CSV, JSON: lists that update on
  their own) and **free-form designs**.
- **Meeting rooms**: a screen by each room shows free or busy, until when and the next
  meetings, and updates the moment a booking changes; on touch screens, "Book now" and "End
  now" with the organization's PIN. Screens never show who booked.
- **Events calendar** from a public iCal link (Google Calendar, Outlook and others), as a list
  or a week; recurring events and time zones included.
- **Building directory** for lobbies: companies and services by floor and room, with arrows
  and floor maps; touch screens filter by floor and category.
- **Synagogue times**: the Hebrew date, the weekly portion, times of the day, the
  congregation's prayers, candle lighting and havdalah, computed on your server for two weeks
  ahead (no outside service), so screens keep correct times offline.
- **Sign-in through the organization** (SSO with Google Workspace, Microsoft Entra ID,
  Keycloak or any OpenID Connect provider) and optional **content approval** before editors'
  changes reach screens.
- **Emergency alerts**: evacuation, shelter or lockdown messages over everything on all or
  chosen screens within seconds, until ended or for a set time.
- **Media fit** per item: fit, fill, or the whole image over a blurred backdrop.

|                             Menu board kit                              |                                         Countdown                                         |                             Free-form design                             |
| :---------------------------------------------------------------------: | :---------------------------------------------------------------------------------------: | :----------------------------------------------------------------------: |
| ![Menu board with four colored zones](docs/screenshots/screen-menu.png) | ![Countdown with days, hours, minutes and seconds](docs/screenshots/screen-countdown.png) | ![A sale slide made in the designer](docs/screenshots/screen-design.png) |

### In the dashboard

- **Free-form designer**: drag, resize and snap text, images and shapes on a canvas; undo/redo,
  layers, templates, and full keyboard control. Gradients, shadows and glows, outlined text,
  color overlays on pictures, five fonts with Hebrew, and entrance and looping animations
  (screens that ask for reduced motion get none).
- **Free image library**: search public-domain (CC0) images and import them in one click —
  through the server and the same malware scan as uploads.
- **Scheduling**: switch layouts or playlists by days, hours and dates (a breakfast menu until
  11:00, a one-week sale, Fridays). Entries are ordered by priority, evaluated on each screen's
  own clock, and a weekly timeline shows what will play — and which entries never will.
  **Shabbat and holidays**: a rule or a playlist item can show only on Shabbat and holidays, or
  never on them, from candle lighting to havdalah at the organization's place (computed on the
  server, decided by each screen offline).
- **Operations**: a page per screen with what each zone shows right now, 24 h / 7 day uptime and
  a clock check (players correct a wrong device clock with the server time); e-mail alerts when a
  screen goes offline and when it is back; **proof-of-play reports** per content and date range,
  with CSV export.
- **Meeting rooms page**: rooms, a day board of bookings, and booking in an accessible form.
- **Integrations** ([guide](docs/INTEGRATIONS.md)): API keys limited to what they may do (start
  emergency alerts from a fire panel, update a text from a queue system, read screen status),
  and signed webhooks when a screen goes offline, an alert starts or a change waits for
  approval.
- **Ready-made kits**: one click creates a designed screen: ten by trade (restaurant, café,
  cinema, retail, office, hotel, community center, synagogue, meeting room, closed on Shabbat) and three general ones (lobby, menu board,
  notice board), in Hebrew or English.
- **Secure media library**: uploads are quarantined, scanned by ClamAV, re-encoded and stripped
  of metadata (EXIF/GPS) before use.
- **Organizations and roles** (owner, admin, editor, viewer), invitations, two-factor
  authentication, audit log.
- **Hebrew-first and accessible**: RTL, dark mode, keyboard navigation, accessibility menu;
  every page is tested with axe-core (WCAG 2.1 AA target).

![The designer: a design with an illustration on its canvas, the toolbar, and the properties of the canvas and its layers](docs/screenshots/cms-designer-en.png)

<details>
<summary>More screenshots</summary>

| The menu / price list editor                                                                  | Ready-made kits by trade                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| ![The menu editor: sections, items, prices and tags](docs/screenshots/cms-menu-editor-en.png) | ![The layouts page with the kits by trade and their pictures](docs/screenshots/cms-layouts-en.png) |

| Screen status: now playing, uptime, clock                                                                | Proof-of-play report with CSV export                                                |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ![A screen page with status, uptime and what each zone shows](docs/screenshots/cms-screen-status-en.png) | ![The play report: plays and time per content](docs/screenshots/cms-reports-en.png) |

| Scheduling with the weekly timeline                                                               | Widgets                                              |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| ![The schedule editor with entries and the weekly timeline](docs/screenshots/cms-schedule-en.png) | ![Widgets page](docs/screenshots/cms-widgets-en.png) |

| Dashboard                                           | Dark mode                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| ![Dashboard](docs/screenshots/cms-dashboard-en.png) | ![Dashboard in dark mode](docs/screenshots/cms-dashboard-dark-en.png) |

| About: credit, license and source code               | Mobile                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ![The About page](docs/screenshots/cms-about-en.png) | ![The dashboard on a phone with the menu open](docs/screenshots/cms-mobile-en.png) |

The pictures are taken by `pnpm --filter @rubinny/cms screens` on a demo installation (see
[CONTRIBUTING.md](CONTRIBUTING.md)).

</details>

### Security and privacy by design

Session cookies (`__Host-`, HttpOnly), Argon2id passwords, MFA, strict CSP on every page,
per-organization isolation (IDOR tests), rate limits, an SSRF-hardened fetcher for RSS,
weather and stock images, and no analytics or third-party trackers. See [SECURITY.md](SECURITY.md).

## Quick start (Docker)

Requirements: Docker with Compose v2, ~3 GB RAM (ClamAV alone uses ~1.5–2 GB), an amd64 or
arm64 server (on arm64, set `CLAMAV_IMAGE` as explained in `deploy/.env.example`).

```bash
git clone https://github.com/diamondrubinny/freescreensign.git rubinny
cd rubinny/deploy
./generate-env.sh                 # writes .env with random secrets
docker compose up -d --build
curl -k https://localhost/health  # {"status":"ok"}
```

Open https://localhost and complete the first-run setup with the `SETUP_TOKEN` from
`deploy/.env`. Without SMTP settings, invitation links are shown to the admin to share.

To turn any device with a modern browser into a screen, open `https://<your-domain>/player/`
in full-screen/kiosk mode and enter the code it shows under **Screens › Add screen**. For
dedicated screens, install a player: the desktop app for Windows and Linux, or the Raspberry Pi
kiosk — see [docs/players.md](docs/players.md).

Set `RUBINNY_DOMAIN` in `deploy/.env` to a real domain to get an automatic Let's Encrypt
certificate, and set `HSTS_MAX_AGE=31536000` in production. Optional features (weather, the
free image library) are described in [`deploy/.env.example`](deploy/.env.example).

**Running it in production:**

- [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md): what is tested automatically,
  what the operator must do, and what needs a professional review.
- [docs/OPERATIONS.md](docs/OPERATIONS.md): encrypted backups and tested restores, health,
  logs and alerts.
- [docs/UPGRADING.md](docs/UPGRADING.md): upgrades, including the move to PostgreSQL 18, and
  verifying signed release images.
- [CHANGELOG.md](CHANGELOG.md): what changed in each version.

## Repository layout

| Path                  | What                                                                                            | License  |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| `apps/server`         | API server + media worker (Fastify, PostgreSQL, Valkey/BullMQ, sharp, ffmpeg, ClamAV)           | AGPL-3.0 |
| `apps/cms`            | Management dashboard (React, RTL-first, WCAG 2.1 AA target)                                     | AGPL-3.0 |
| `apps/player`         | Offline-first web player (PWA): pairing, verified media cache, zones, widgets, WebSocket        | AGPL-3.0 |
| `apps/desktop`        | Desktop player app for Windows and Linux (Electron)                                             | AGPL-3.0 |
| `apps/android`        | Android / Android TV player app (WebView)                                                       | AGPL-3.0 |
| `apps/tv`             | Loader apps for Samsung (Tizen) and LG (webOS) screens                                          | AGPL-3.0 |
| `apps/showcase`       | Development tool: screenshots of the starter kits for the READMEs and the dashboard             | AGPL-3.0 |
| `packages/shared`     | Shared schemas: player manifest, layouts, widgets, designs, pairing codes, roles, Hebrew dates  | MIT      |
| `packages/widget-sdk` | SDK for community widgets (the built-in widgets use it too)                                     | MIT      |
| `deploy/`             | Docker Compose: Caddy, PostgreSQL, Valkey, SeaweedFS (S3), ClamAV; Raspberry Pi kiosk installer | AGPL-3.0 |
| `docs/`               | Specification, phase plans and results, screenshots                                             | —        |

Now: v0.9.0, which adds integrations: API keys for other systems and signed webhooks
([guide](docs/INTEGRATIONS.md)). v0.8.0 added meeting rooms with booking at the screen, an events calendar, a
building directory and synagogue times, with two new kits
([plan and results](docs/phases/18-rooms-directory-calendar-zmanim.md)). 0.7.1 added the
attribution "Powered by Rubinny · Open source" in every part of Rubinny
([plan and results](docs/phases/16-attribution.md)). 0.7 brought seven starter kits by trade and original art, a menu / price list widget,
and a designer with gradients, shadows, fonts and animations
([plan and results](docs/phases/15-showcase.md)). 0.6 added time windows for playlist items,
screen groups, a time zone per screen, a server status page for the operator
([plan and results](docs/phases/13-next-plan.md)), and Samsung and LG screens
([plan](docs/phases/14-tizen-webos.md), not yet verified on a device); 0.4 added touch screens, video walls and
writing suggestions with your own AI key, 0.3 SSO (OpenID Connect) and content approval, 0.2
data tables, emergency alerts, row-level security and arm64 images.
See the [roadmap](docs/PLAN.md).

## Development

```bash
pnpm install
pnpm check      # format, lint, typecheck, tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for running the server locally, integration tests and
the end-to-end/accessibility suite.

## Support the project

Rubinny is free and stays free: every feature, no paid edition. Sponsorship pays for the time
that goes into it: development, security fixes, accessibility work and the Hebrew interface.

[![Sponsor Rubinny on GitHub](https://img.shields.io/badge/Sponsor-Rubinny-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/diamondrubinny)

| Tier         | Per month | You get                                                       |
| ------------ | --------: | ------------------------------------------------------------- |
| Supporter    |        $5 | Our thanks                                                    |
| Backer       |       $25 | Your name in the sponsors list below                          |
| Organization |      $100 | Your logo in the sponsors list below                          |
| Partner      |      $500 | A large logo at the top of the list, and a say in the roadmap |

One-time amounts are welcome too. Sponsorship is a donation to the project: it does not buy
support, a warranty or a service level, and the license stays the same for everyone.

**Sponsors:** be the first!

## License

Rubinny is free software under the **GNU AGPL-3.0** with attribution terms; SDK packages
are **MIT**. See [LICENSING.md](LICENSING.md) and [TRADEMARKS.md](TRADEMARKS.md).

Created by **Diamond Rubinny**. Copyright © 2026 The Rubinny Authors (see [AUTHORS.md](AUTHORS.md)).

---

## 💼 Commercial license & rights acquisition

Rubinny Signage is free and open source under the AGPL-3.0. If you are interested in a **commercial license** (use without AGPL obligations), **white-label / exclusive rights**, or **acquiring full rights to the code**, send your proposal to **[d@rubinny.net](mailto:d@rubinny.net)**.

Please include: who you are (company / contact), how you intend to use the code, and your offer.

> 🇮🇱 מעוניינים ברישיון מסחרי, בזכויות בלעדיות או ברכישת הזכויות בקוד? שלחו הצעה ל-**[d@rubinny.net](mailto:d@rubinny.net)** — כולל פרטי קשר, אופן השימוש המתוכנן וההצעה שלכם.
