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
docker run -d --name rubinny-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=rubinny -p 5432:5432 postgres:17-alpine
docker run -d --name rubinny-valkey -p 6379:6379 valkey/valkey:8-alpine
cp apps/server/.env.example apps/server/.env
pnpm --filter @rubinny/server dev
```

Integration tests run against real services:

```bash
RUBINNY_INTEGRATION=1 DATABASE_URL=postgres://rubinny:dev@localhost:5432/rubinny \
  REDIS_URL=redis://localhost:6379 pnpm test
```

## Code standards

- TypeScript strict mode; no `any` without a comment explaining why.
- Validate all external input with Zod (shared schemas live in `packages/shared`).
- Every org-scoped query must filter by organization id (IDOR protection).
- Never log secrets, tokens, passwords or personal data.
- UI: semantic HTML, keyboard accessible, RTL-safe (CSS logical properties), WCAG 2.1 AA.
- Code, identifiers and comments in English; user-facing text through i18n (Hebrew + English).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## Pull requests

Fill in the PR template, keep PRs focused, and make sure CI is green.
