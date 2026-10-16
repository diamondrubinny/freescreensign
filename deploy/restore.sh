#!/usr/bin/env bash
# Restores a backup made by backup.sh into the installation in this folder — the same
# server, or a new one (install Docker, copy this deploy folder, then restore).
#
#   ./restore.sh rubinny-backup-<time>.tar[.age] [--identity KEYFILE] [--yes]
#
# REPLACES the current database, media, certificates and .env (the current .env is kept as
# .env.before-restore-<time>). The backup's checksums are verified before anything changes.
#
# License: AGPL-3.0-only. Part of Rubinny. See docs/OPERATIONS.md.

set -euo pipefail
cd "$(dirname "$0")"

FILE=""
IDENTITY=""
YES=0

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}
log() { printf '==> %s\n' "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --identity)
      [ $# -ge 2 ] || die "--identity needs a key file"
      IDENTITY="$2"
      shift 2
      ;;
    --yes) YES=1 && shift ;;
    -h | --help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *)
      [ -z "$FILE" ] || die "only one backup file"
      FILE="$1"
      shift
      ;;
  esac
done

[ -n "$FILE" ] || die "which backup? ./restore.sh <file> (see --help)"
[ -f "$FILE" ] || die "no such file: $FILE"
command -v docker >/dev/null || die "docker is required"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
umask 077

log "Reading the backup"
case "$FILE" in
  *.age)
    command -v age >/dev/null || die "age is required to decrypt"
    [ -n "$IDENTITY" ] || die "encrypted backup: pass --identity <age key file>"
    age -d -i "$IDENTITY" "$FILE" | tar -C "$WORK" -xf -
    ;;
  *) tar -C "$WORK" -xf "$FILE" ;;
esac
for part in postgres.dump storage.tar env SHA256SUMS; do
  [ -f "$WORK/$part" ] || die "not a Rubinny backup (missing $part)"
done
(cd "$WORK" && sha256sum --quiet -c SHA256SUMS) || die "the backup is damaged (checksum mismatch)"
sed 's/^/    /' "$WORK/manifest.txt" >&2 || true

env_value() { sed -n "s/^$1=//p" "$2" | tail -n 1; }
PG_USER="$(env_value POSTGRES_USER "$WORK/env")"
PG_USER="${PG_USER:-rubinny}"
if [ -f .env ]; then
  CURRENT_USER="$(env_value POSTGRES_USER .env)"
  [ "${CURRENT_USER:-rubinny}" = "$PG_USER" ] ||
    die "POSTGRES_USER differs between the backup ($PG_USER) and this installation; restore into a fresh installation"
fi

if [ "$YES" -ne 1 ]; then
  printf 'This REPLACES all Rubinny data here with the backup. Type "restore" to continue: ' >&2
  read -r answer
  [ "$answer" = "restore" ] || die "cancelled"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [ -f .env ]; then cp -p .env ".env.before-restore-$STAMP"; fi
cp "$WORK/env" .env
chmod 600 .env

log "Stopping the stack"
docker compose stop >/dev/null 2>&1 || true
# Containers must exist (with their volumes) to restore into them.
docker compose create >/dev/null
container() { docker compose ps -aq "$1"; }

log "Restoring the media storage"
STORAGE_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$(container storage)")"
docker run --rm -i --network none --volumes-from "$(container storage)" --entrypoint sh \
  "$STORAGE_IMAGE" -c 'find /data -mindepth 1 -delete && tar -C /data -xf -' <"$WORK/storage.tar"

if [ -f "$WORK/caddy.tar" ]; then
  log "Restoring the HTTPS certificates"
  WEB_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$(container web)")"
  docker run --rm -i --network none --user 0 --volumes-from "$(container web)" --entrypoint sh \
    "$WEB_IMAGE" -c 'find /data -mindepth 1 -delete && tar -C /data -xf -' <"$WORK/caddy.tar"
fi

log "Restoring PostgreSQL"
docker compose up -d --wait postgres >/dev/null
docker compose exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' <"$WORK/postgres.dump"
# The database role keeps the password of this installation; set the restored one.
RESTORED_PASSWORD="$(env_value POSTGRES_PASSWORD .env)"
printf '%s\n' "ALTER ROLE :\"role\" PASSWORD :'password';" |
  docker compose exec -T -e RESTORE_PASSWORD="$RESTORED_PASSWORD" postgres sh -c \
    'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v role="$POSTGRES_USER" -v password="$RESTORE_PASSWORD"'

log "Starting the stack with the restored settings"
docker compose up -d --force-recreate --wait >/dev/null
log "Restored. The previous .env is in .env.before-restore-$STAMP (delete it once all is well)."
