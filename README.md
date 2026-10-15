# Rubinny

**Free & open-source digital signage.** Manage screens, media, playlists, layouts and
schedules from one web dashboard. Self-hosted, offline-first player, Hebrew/RTL and
accessibility built in. Runs on anything with a modern browser — Raspberry Pi, Windows,
Linux, Android / Android TV / Fire TV, with Samsung Tizen and LG webOS planned.

[עברית](README.he.md) · [Specification & roadmap](docs/PLAN.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

> **Status: early development (Phase 2a of 9 complete: secure accounts & organizations API).** Not ready for production yet.

## Quick start (Docker)

Requirements: Docker with Compose v2, ~3 GB RAM (ClamAV alone uses ~1.5–2 GB).

```bash
git clone https://github.com/diamondrubinny/freescreensign.git rubinny
cd rubinny/deploy
./generate-env.sh                 # writes .env with random secrets
docker compose up -d --build
curl -k https://localhost/health  # {"status":"ok"}
```

Set `RUBINNY_DOMAIN` in `deploy/.env` to a real domain to get an automatic Let's Encrypt
certificate, and set `HSTS_MAX_AGE=31536000` in production.

## Repository layout

| Path              | What                                                              | License  |
| ----------------- | ----------------------------------------------------------------- | -------- |
| `apps/server`     | API + realtime server (Fastify, PostgreSQL, Valkey)               | AGPL-3.0 |
| `packages/shared` | Shared schemas: player manifest, pairing codes, roles, locales    | MIT      |
| `deploy/`         | Docker Compose: Caddy, PostgreSQL, Valkey, SeaweedFS (S3), ClamAV | AGPL-3.0 |
| `docs/`           | Specification, phase plans                                        | —        |

Coming next: `apps/cms` (dashboard), `apps/player` (PWA player), `apps/worker` (media
pipeline), `packages/widget-sdk`, and player wrappers for each platform.

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
