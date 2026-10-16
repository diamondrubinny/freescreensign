# Changelog

All notable changes to Rubinny. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x: anything may still change).

## [Unreleased]

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

[0.2.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.2.0
[0.1.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.1.0
