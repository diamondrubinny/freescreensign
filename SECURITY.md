# Security Policy

## Reporting a vulnerability

**Please do not open public issues for security problems.**

Report vulnerabilities privately through GitHub:
**Security → Advisories → Report a vulnerability** on this repository.

Please include steps to reproduce, affected version/commit and impact. We aim to:

- acknowledge reports within **3 business days**,
- provide an initial assessment within **10 business days**,
- credit reporters (if they wish) once a fix is released.

## Supported versions

Rubinny is pre-release (0.x). Only the latest `main` branch receives security fixes.

## Scope

In scope: server/API, CMS, player, official Docker images and deployment files.
Out of scope: third-party services, self-hosted instances' own misconfiguration,
denial of service by volume, and social engineering.

## Hardening guidance for operators

- Always run behind HTTPS (the bundled Caddy configuration does this automatically).
- Generate secrets with `deploy/generate-env.sh`; never reuse example values.
- Keep Docker images updated and back up PostgreSQL and object storage regularly.
