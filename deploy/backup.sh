#!/usr/bin/env bash
# Backs up a Rubinny installation (Docker Compose, this folder) into one file:
#   PostgreSQL (pg_dump), the media storage volume, the HTTPS certificates, and .env.
#
#   ./backup.sh [--output DIR] [--age-recipient KEY]... [--age-recipients-file FILE]
#
# .env holds the secrets the data needs (ENCRYPTION_KEY decrypts MFA secrets), so the
# backup is as sensitive as the server itself: encrypt it with age (--age-recipient) and
# keep it off the server. The app is paused for the dump so that the database and the
# media match; screens keep playing from their offline cache meanwhile.
#
# License: AGPL-3.0-only. Part of Rubinny. See docs/OPERATIONS.md.

set -euo pipefail
cd "$(dirname "$0")"

OUTPUT="./backups"
AGE_ARGS=()

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}
log() { printf '==> %s\n' "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --output)
      [ $# -ge 2 ] || die "--output needs a folder"
      OUTPUT="$2"
      shift 2
      ;;
    --age-recipient)
      [ $# -ge 2 ] || die "--age-recipient needs a public key"
      AGE_ARGS+=(-r "$2")
      shift 2
      ;;
    --age-recipients-file)
      [ $# -ge 2 ] || die "--age-recipients-file needs a file"
      AGE_ARGS+=(-R "$2")
      shift 2
      ;;
    -h | --help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

command -v docker >/dev/null || die "docker is required"
[ -f .env ] || die "no .env here: run this in the deploy folder of an installation"
if [ ${#AGE_ARGS[@]} -gt 0 ]; then command -v age >/dev/null || die "age is required for encryption"; fi

container() { docker compose ps -aq "$1"; }
[ -n "$(container postgres)" ] || die "the stack is not installed here (docker compose up first)"
[ -n "$(container storage)" ] || die "no storage container"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
umask 077
mkdir -p "$OUTPUT"

# The app services that write data; they are paused for the backup and always restarted.
PAUSED=()
for service in server worker; do
  if [ -n "$(docker compose ps -q --status running "$service")" ]; then PAUSED+=("$service"); fi
done
STORAGE_WAS_RUNNING="$(docker compose ps -q --status running storage)"
restore_services() {
  if [ -n "$STORAGE_WAS_RUNNING" ]; then docker compose start storage >/dev/null 2>&1 || true; fi
  if [ ${#PAUSED[@]} -gt 0 ]; then docker compose start "${PAUSED[@]}" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap restore_services EXIT

if [ ${#PAUSED[@]} -gt 0 ]; then
  log "Pausing ${PAUSED[*]} (screens keep playing from their cache)"
  docker compose stop "${PAUSED[@]}" >/dev/null
fi

log "Dumping PostgreSQL"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$WORK/postgres.dump"
PG_VERSION="$(docker compose exec -T postgres sh -c 'postgres --version' | tr -d '\r')"

log "Copying the media storage"
STORAGE_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$(container storage)")"
docker compose stop storage >/dev/null
docker run --rm --network none --volumes-from "$(container storage)" --entrypoint tar \
  "$STORAGE_IMAGE" -C /data -cf - . >"$WORK/storage.tar"
docker compose start storage >/dev/null

if [ -n "$(docker compose ps -q --status running web)" ]; then
  log "Copying the HTTPS certificates"
  docker compose exec -T web tar -C /data -cf - . >"$WORK/caddy.tar"
fi

cp .env "$WORK/env"
cat >"$WORK/manifest.txt" <<EOF
Rubinny backup
created: $STAMP
postgres: $PG_VERSION
storage image: $STORAGE_IMAGE
EOF
(cd "$WORK" && sha256sum -- * >SHA256SUMS)

NAME="rubinny-backup-$STAMP.tar"
if [ ${#AGE_ARGS[@]} -gt 0 ]; then
  tar -C "$WORK" -cf - . | age "${AGE_ARGS[@]}" -o "$OUTPUT/$NAME.age"
  FILE="$OUTPUT/$NAME.age"
else
  tar -C "$WORK" -cf "$OUTPUT/$NAME" .
  FILE="$OUTPUT/$NAME"
  log "WARNING: not encrypted, and it contains the server's secrets (.env). Use --age-recipient."
fi
chmod 600 "$FILE"
log "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# For the operator's status page: when the last backup finished, its size, and whether it
# is encrypted. A failure here does not fail the backup (e.g. an older version without
# the table).
SIZE="$(stat -c %s "$FILE")"
ENCRYPTED=false
if [ ${#AGE_ARGS[@]} -gt 0 ]; then ENCRYPTED=true; fi
if ! docker compose exec -T postgres sh -c \
  'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 <<SQL; then
INSERT INTO backup_runs (size_bytes, encrypted) VALUES ($SIZE, $ENCRYPTED);
SQL
  log "note: could not record the backup for the status page"
fi
log "Copy it off this server. Restore with: ./restore.sh $FILE"
printf '%s\n' "$FILE"
