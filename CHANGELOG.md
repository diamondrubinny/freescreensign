# Changelog

All notable changes to Rubinny. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x: anything may still change).

## [Unreleased]

### Added

- Credit: "Created by Diamond Rubinny" in the dashboard footer, README, NOTICE, a new
  AUTHORS.md, and the desktop app's author and package maintainer.

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

[0.1.0]: https://github.com/diamondrubinny/freescreensign/releases/tag/v0.1.0
