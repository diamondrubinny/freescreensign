# Contributing to Rubinny

Thank you for helping build free digital signage for everyone! Contributions of
all kinds are welcome: code, translations, documentation, testing on hardware,
design and accessibility reviews.

## Ground rules

- Be kind — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Report security issues privately — see [SECURITY.md](SECURITY.md).
- Discuss large changes in an issue before writing a lot of code.

## Developer Certificate of Origin (DCO)

Every commit must be signed off to certify that you wrote the code or have the
right to submit it under the project's licenses
([developercertificate.org](https://developercertificate.org/)):

```bash
git commit -s -m "feat(server): add screen groups"
```

## Development setup

Requirements: Node.js ≥ 22.12 (see `.nvmrc`), pnpm 10, Docker (optional, for the full stack).

```bash
corepack enable          # or: npm install -g pnpm@10
pnpm install
pnpm check               # format, lint, typecheck, unit tests
```

Running the server locally needs PostgreSQL and Valkey/Redis:

```bash
docker run -d --name rubinny-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=rubinny -p 5432:5432 postgres:18-alpine
docker run -d --name rubinny-valkey -p 6379:6379 valkey/valkey:9-alpine
cp apps/server/.env.example apps/server/.env
# set ENCRYPTION_KEY in apps/server/.env:  openssl rand -base64 32
pnpm --filter @rubinny/server dev        # migrations run automatically on start
```

Run the management dashboard (CMS) with hot reload; it proxies `/api` to the server:

```bash
pnpm --filter @rubinny/cms dev          # http://localhost:5173
pnpm --filter @rubinny/player dev       # http://localhost:5174/player/ (proxies /player/v1 incl. WebSocket)
```

End-to-end and accessibility tests (Playwright + axe-core) run against the Docker stack
and need an empty database:

```bash
cd deploy && ./generate-env.sh && ./e2e-reset.sh && cd ..
E2E_SETUP_TOKEN=$(grep ^SETUP_TOKEN= deploy/.env | cut -d= -f2) pnpm e2e
```

Media integration tests additionally need S3 storage and ClamAV (and `ffmpeg` on the host):

```bash
docker run -d --name rubinny-s3 -p 8333:8333 -e S3_ACCESS_KEY_ID=devkey -e S3_SECRET_ACCESS_KEY=dev-secret-0123456789 \
  -v "$PWD/deploy/seaweedfs/entrypoint.sh:/rubinny/entrypoint.sh:ro" --entrypoint /bin/sh \
  chrislusf/seaweedfs:4.48 /rubinny/entrypoint.sh
docker run -d --name rubinny-clamav -p 3310:3310 -e CLAMD_CONF_StreamMaxLength=1024M clamav/clamav:stable
RUBINNY_INTEGRATION=1 RUBINNY_MEDIA_INTEGRATION=1 S3_ENDPOINT=http://localhost:8333 \
  S3_ACCESS_KEY_ID=devkey S3_SECRET_ACCESS_KEY=dev-secret-0123456789 CLAMAV_HOST=localhost \
  DATABASE_URL=postgres://rubinny:dev@localhost:5432/rubinny REDIS_URL=redis://localhost:6379 pnpm test
```

Integration tests run against real services. Each test gets its own PostgreSQL
schema, so they run in parallel without interfering:

```bash
RUBINNY_INTEGRATION=1 DATABASE_URL=postgres://rubinny:dev@localhost:5432/rubinny \
  REDIS_URL=redis://localhost:6379 pnpm test
```

After changing a starter kit, its art or the look of a widget, regenerate the kit pictures
(the READMEs' gallery and the dashboard's kit previews) with the player's own code in Chromium:

```bash
pnpm --filter @rubinny/shared build
pnpm --filter @rubinny/showcase screens   # PLAYWRIGHT_CHROMIUM_PATH=... for a custom Chromium
```

Look at the pictures before committing them: they are what people see first.

## Code standards

- TypeScript strict mode; no `any` without a comment explaining why.
- Validate all external input with Zod (shared schemas live in `packages/shared`).
- Every org-scoped query must filter by organization id (IDOR protection).
- Never log secrets, tokens, passwords or personal data.
- UI: semantic HTML, keyboard accessible, RTL-safe (CSS logical properties), WCAG 2.1 AA.
- Code, identifiers and comments in English; user-facing text through i18n (Hebrew + English).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Every source file starts with the Rubinny attribution header: run
  `node scripts/headers.mjs --fix` after adding files (CI checks it with `pnpm attribution`).
  The attribution must be kept (LICENSING.md).

## Pull requests

Fill in the PR template, keep PRs focused, and make sure CI is green.
