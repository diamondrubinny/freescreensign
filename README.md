# Rubinny

**Free & open-source digital signage platform** — manage screens, media, playlists, layouts and schedules from one web dashboard. Self-hosted, offline-first player, Hebrew/RTL and accessibility built in.

> Status: **Planning (Phase 0)**. See [`docs/PLAN.md`](docs/PLAN.md) for the full specification and roadmap.

## Planned components
- `apps/server` — API + realtime (Fastify, PostgreSQL, Redis)
- `apps/worker` — media pipeline (ClamAV scan, thumbnails, transcoding)
- `apps/cms` — admin dashboard (React)
- `apps/player` — offline-first PWA player (Raspberry Pi, PC, Android)
- `packages/widget-sdk` — build community widgets

## License
To be decided — see open questions in `docs/PLAN.md`.
