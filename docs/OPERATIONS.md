# Operating a Rubinny server

How to keep an installation (`deploy/`, Docker Compose) safe: backups, restores, health and
logs. For upgrades see [UPGRADING.md](UPGRADING.md); for screens see [players.md](players.md).

## Backups

```bash
cd deploy
age-keygen -o ~/rubinny-backup-key.txt          # once; keep this key OFF the server
./backup.sh --age-recipient "$(age-keygen -y ~/rubinny-backup-key.txt)"
```

- **What is in a backup:**
  - the database (`pg_dump`);
  - the media storage (uploads, thumbnails, screenshots);
  - the HTTPS certificates;
  - `deploy/.env`. Without it the data is unusable: `ENCRYPTION_KEY` decrypts two-factor secrets.
- **What is not:**
  - the job queue in Valkey (rebuilt as work comes in);
  - ClamAV signatures (downloaded again).
- **Keep backups encrypted and off the server.** A backup holds every secret of the
  installation. `backup.sh` encrypts with [age](https://age-encryption.org) to the public keys
  you give (`--age-recipient`, or `--age-recipients-file`). Without them it warns and writes an
  unencrypted file (mode 600).
- **Short pause:** the server and the media worker stop while the database and media are
  copied, so both match. Screens keep playing from their offline cache; the dashboard is
  unavailable for that time (seconds to minutes, depending on the media size).
- **Schedule it**, e.g. nightly with cron or a systemd timer:
  `0 3 * * * cd /opt/rubinny/deploy && ./backup.sh --output /var/backups/rubinny --age-recipient age1… && <copy off-site>`.
  Delete old files according to your retention policy.
- **Media still processing** (just uploaded) at backup time stays "processing" after a
  restore; upload it again.

## Restoring

```bash
cd deploy
./restore.sh rubinny-backup-20261016T030000Z.tar.age --identity ~/rubinny-backup-key.txt
```

- **On the same server, or a new one:** install Docker, copy the `deploy/` folder of the same
  Rubinny version, then restore. There's no need to run `generate-env.sh` first. If you did,
  the restored `.env` replaces it, and the previous one is kept as `.env.before-restore-<time>`.
- **The checksums of every part are verified before anything changes.** A damaged or
  tampered backup is refused.
- **Everything in the installation is replaced:** database, media, certificates and settings. It
  asks you to type `restore` (or pass `--yes` in automation).
- **Test your restores.** CI does it on every change (`deploy/test/backup-roundtrip.sh`:
  backup, delete everything, new installation, restore, compare). Repeat it from time to time
  on a spare machine with a real backup.

## Health and logs

- **Health checks:**
  - `GET /health` (public, through Caddy) answers while the server process is up.
  - `GET /health/ready` also checks the dependencies (database, Valkey, storage, ClamAV). It's on the
    internal network only. To check it from the host:
    `docker compose exec server node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>r.text()).then(console.log)"`.
  - Every service has a Docker health check (`docker compose ps`).
  - The media worker writes a heartbeat that its health check reads.
- **Logs:**
  - `docker compose logs -f server worker web`.
  - The server logs are JSON (pino), with authorization headers, cookies and tokens redacted.
    Passwords, tokens and uploaded content are never logged.
- **Recommended alerts:**
  - `/health` or `/health/ready` not OK;
  - disk usage above 80% (Docker volumes);
  - a backup not written in 26 hours;
  - certificate renewal errors (`docker compose logs web`).
- **Screens:** Rubinny itself e-mails organization admins when screens go offline (Settings ›
  Alerts, needs SMTP).
- **Audit log:** sign-ins, failed sign-ins, role changes, deletions and admin actions are in
  the organization's audit log (kept one year).

## Database isolation (row-level security)

Since 0.2, every request to an organization's data runs in a database transaction as the
role `rubinny_tenant`, with the organization set for that transaction. PostgreSQL then only
shows and accepts that organization's rows, even if a query in the code forgot to filter. Screens,
the worker and sign-in keep using the regular database user.

- **Setup:** none. The migration creates the role and grants it to the database user. This
  needs permission to create roles, which the bundled PostgreSQL container has.
- **Managed databases (RDS, Cloud SQL and similar):** if the database user may not create
  roles, the server logs `Row-level security is not active` at startup and keeps working with
  the isolation in the code, as in 0.1. Whether and how a role can be created there requires
  verification against the provider's documentation.
- **Settings:**
  - `DATABASE_POOL_MAX` (default 20): connections per server process. An organization request
    holds one connection while it runs; media uploads do not.
  - `DATABASE_RLS=false` turns it off (for troubleshooting only).
- **Cost:** measured on the test machine, organization routes serve 20–30% fewer requests per
  second (about 550–650 instead of 780–850). Screens are not affected.
- **Restoring by hand:** roles belong to the PostgreSQL server, not to a dump. Before
  `pg_restore` into a new server, create the role as `deploy/restore.sh` does.

## Security updates

- Run `docker compose pull && docker compose up -d --build` regularly (base images, ClamAV)
  and update Rubinny itself to the latest release ([UPGRADING.md](UPGRADING.md)).
- Keep the host updated (unattended-upgrades or equivalent), allow only ports 80/443
  publicly, and use SSH keys.
