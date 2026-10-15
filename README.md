# Rubinny

**Free & open-source digital signage.** Manage screens, media, playlists, layouts and
schedules from one web dashboard. Self-hosted, offline-first player, Hebrew/RTL and
accessibility built in. Runs on anything with a modern browser — Raspberry Pi, Windows,
Linux, Android / Android TV / Fire TV, with Samsung Tizen and LG webOS planned.

[עברית](README.he.md) · [Specification & roadmap](docs/PLAN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

> **Status: early development (Phase 5 of 9 complete: secure media library, playlists, screen pairing, an offline-first web player, layouts with zones and built-in widgets).** Not ready for production yet.

## Quick start (Docker)

Requirements: Docker with Compose v2, ~3 GB RAM (ClamAV alone uses ~1.5–2 GB).

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
in full-screen/kiosk mode and enter the code it shows under **Screens › Add screen**.

Set `RUBINNY_DOMAIN` in `deploy/.env` to a real domain to get an automatic Let's Encrypt
certificate, and set `HSTS_MAX_AGE=31536000` in production.

## Repository layout

| Path                  | What                                                                                                  | License  |
| --------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| `apps/server`         | API server + media worker (Fastify, PostgreSQL, Valkey/BullMQ, sharp, ffmpeg)                         | AGPL-3.0 |
| `apps/cms`            | Management dashboard (React, RTL-first, WCAG 2.1 AA target)                                           | AGPL-3.0 |
| `apps/player`         | Offline-first web player (PWA) served at `/player/`: pairing, verified media cache, WebSocket updates | AGPL-3.0 |
| `packages/shared`     | Shared schemas: player manifest, layouts, widget settings, pairing codes, roles, Hebrew dates         | MIT      |
| `packages/widget-sdk` | SDK for community widgets (the built-in widgets use it too)                                           | MIT      |
| `deploy/`             | Docker Compose: Caddy, PostgreSQL, Valkey, SeaweedFS (S3), ClamAV                                     | AGPL-3.0 |
| `docs/`               | Specification, phase plans                                                                            | —        |

Built-in widgets: clock with Hebrew date, text, ticker, QR code, RSS, weather (opt-in, see `deploy/.env.example`) and web page.

Coming next: scheduling, operations (proof of play, alerts) and player wrappers for each platform.

## Development

```bash
pnpm install
pnpm check      # format, lint, typecheck, tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for running the server locally and integration tests.

## License

Rubinny is free software under the **GNU AGPL-3.0** with attribution terms; SDK packages
are **MIT**. See [LICENSING.md](LICENSING.md) and [TRADEMARKS.md](TRADEMARKS.md).

Copyright © 2026 The Rubinny Authors.
