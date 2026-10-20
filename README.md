# Rubinny

**Free & open-source digital signage.** Design content, build layouts, and run any number of
screens from one web dashboard — self-hosted, offline-first, with Hebrew/RTL and accessibility
built in. Runs on anything with a modern browser: Raspberry Pi, Windows, Linux, Android /
Android TV / Fire TV, and Samsung (Tizen) and LG (webOS) screens (not yet verified on a device).

[עברית](README.he.md) · [Specification & roadmap](docs/PLAN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Sponsor](#support-the-project)

> **Status: early development** — phase 8 of 9 complete (media, playlists, screens, offline
> player, layouts, widgets, a free-form designer, a free image library, scheduling, operations,
> and players for Windows, Linux, Raspberry Pi and Android). Not ready for production yet.

![A screen running the "Lobby" kit: main content with a blurred backdrop, a clock with the Hebrew date, and an updates ticker](docs/screenshots/screen-lobby.png)

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
  news, weather (opt-in), web page, countdown, **data tables** (Google Sheets, CSV, JSON:
  menus, price lists and timetables that update on their own) and **free-form designs**.
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
  layers, templates, and full keyboard control.
- **Free image library**: search public-domain (CC0) images and import them in one click —
  through the server and the same malware scan as uploads.
- **Scheduling**: switch layouts or playlists by days, hours and dates (a breakfast menu until
  11:00, a one-week sale, Fridays). Entries are ordered by priority, evaluated on each screen's
  own clock, and a weekly timeline shows what will play — and which entries never will.
- **Operations**: a page per screen with what each zone shows right now, 24 h / 7 day uptime and
  a clock check (players correct a wrong device clock with the server time); e-mail alerts when a
  screen goes offline and when it is back; **proof-of-play reports** per content and date range,
  with CSV export.
- **Ready-made kits**: one click creates a designed screen (lobby, menu board, notice board).
- **Secure media library**: uploads are quarantined, scanned by ClamAV, re-encoded and stripped
  of metadata (EXIF/GPS) before use.
- **Organizations and roles** (owner, admin, editor, viewer), invitations, two-factor
  authentication, audit log.
- **Hebrew-first and accessible**: RTL, dark mode, keyboard navigation, accessibility menu;
  every page is tested with axe-core (WCAG 2.1 AA target).

![The designer: canvas with selection handles, toolbar, properties and layers](docs/screenshots/cms-designer.png)

<details>
<summary>More screenshots</summary>

| Screen status: now playing, uptime, clock                                                             | Proof-of-play report with CSV export                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![A screen page with status, uptime and what each zone shows](docs/screenshots/cms-screen-status.png) | ![The play report: plays and time per content](docs/screenshots/cms-reports.png) |

| Scheduling with the weekly timeline                                                            |
| ---------------------------------------------------------------------------------------------- |
| ![The schedule editor with entries and the weekly timeline](docs/screenshots/cms-schedule.png) |

| Dashboard                                        | Dark mode                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| ![Dashboard](docs/screenshots/cms-dashboard.png) | ![Dashboard in dark mode](docs/screenshots/cms-dashboard-dark.png) |

| Layouts and ready-made kits                       | Widgets                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| ![Layouts page](docs/screenshots/cms-layouts.png) | ![Widgets page](docs/screenshots/cms-widgets.png) |

Mobile: <br>![The dashboard on a phone with the menu open](docs/screenshots/cms-mobile.png)

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
| `packages/shared`     | Shared schemas: player manifest, layouts, widgets, designs, pairing codes, roles, Hebrew dates  | MIT      |
| `packages/widget-sdk` | SDK for community widgets (the built-in widgets use it too)                                     | MIT      |
| `deploy/`             | Docker Compose: Caddy, PostgreSQL, Valkey, SeaweedFS (S3), ClamAV; Raspberry Pi kiosk installer | AGPL-3.0 |
| `docs/`               | Specification, phase plans and results, screenshots                                             | —        |

Now: v0.6.0, with time windows for playlist items, screen groups, a time zone per screen and a
server status page for the operator
([plan and results](docs/phases/13-next-plan.md)); 0.4 added touch screens, video walls and
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
