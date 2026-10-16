#!/usr/bin/env bash
# Proves that a backup restores: fingerprints the data of the running stack, takes an
# encrypted backup, DESTROYS the installation (volumes and .env), installs from scratch
# with new secrets, restores, and compares the fingerprints.
#
#   RUBINNY_DESTRUCTIVE_TEST=1 deploy/test/backup-roundtrip.sh
#
# Only for throwaway environments (CI, a development machine with test data).

set -euo pipefail
cd "$(dirname "$0")/.."

[ "${RUBINNY_DESTRUCTIVE_TEST:-}" = 1 ] || {
  echo "Refusing: this deletes all Rubinny data here. Set RUBINNY_DESTRUCTIVE_TEST=1." >&2
  exit 1
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}
ok() { printf 'ok - %s\n' "$*"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql_value() {
  docker compose exec -T postgres sh -c 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$1"
}

# Rows that do not change on their own (no heartbeats, sessions or uptime counters).
fingerprint_db() {
  local table
  for table in users organizations memberships media playlists playlist_items layouts \
    layout_zones widgets schedules schedule_entries play_events schema_migrations; do
    printf '%s %s\n' "$table" \
      "$(psql_value "SELECT count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) FROM $table t;")"
  done
  printf 'screens %s\n' \
    "$(psql_value "SELECT count(*) || ' ' || md5(coalesce(string_agg(id || name || org_id, '|' ORDER BY id), '')) FROM screens;")"
}

# Every object in both buckets (key, size, ETag = MD5 of the content).
fingerprint_storage() {
  docker compose exec -T server node --input-type=module -e "
    import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
    const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
    for (const bucket of [process.env.S3_BUCKET_MEDIA ?? 'rubinny-media', process.env.S3_BUCKET_QUARANTINE ?? 'rubinny-quarantine']) {
      let token;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const o of page.Contents ?? []) console.log(bucket, o.Key, o.Size, o.ETag);
        token = page.NextContinuationToken;
      } while (token);
    }" | sort
}

[ -f .env ] || fail "no installation here"
fingerprint_db >"$TMP/db.before"
fingerprint_storage >"$TMP/storage.before"
[ "$(sed -n 's/^users \([0-9]*\) .*/\1/p' "$TMP/db.before")" -gt 0 ] || fail "no users: run the E2E tests first"
[ -s "$TMP/storage.before" ] || fail "no media objects: run the E2E tests first"
cp .env "$TMP/env.before"
ok "fingerprinted $(wc -l <"$TMP/storage.before") objects and $(wc -l <"$TMP/db.before") tables"

age-keygen -o "$TMP/key.txt" 2>/dev/null
RECIPIENT="$(age-keygen -y "$TMP/key.txt")"
BACKUP="$(./backup.sh --output "$TMP/backups" --age-recipient "$RECIPIENT")"
[ -f "$BACKUP" ] || fail "no backup file"
[ "$(stat -c %a "$BACKUP")" = 600 ] || fail "backup is readable by others"
if age -d -i /dev/null "$BACKUP" >/dev/null 2>&1; then fail "backup readable without the key"; fi
ok "encrypted backup written ($(du -h "$BACKUP" | cut -f1)) and the stack is running again"
curl -skf https://localhost/health >/dev/null || fail "stack not healthy after the backup"

# A damaged backup must be refused before anything is touched.
age -d -i "$TMP/key.txt" "$BACKUP" >"$TMP/plain.tar"
mkdir "$TMP/damaged" && tar -C "$TMP/damaged" -xf "$TMP/plain.tar"
printf 'x' >>"$TMP/damaged/postgres.dump"
tar -C "$TMP/damaged" -cf "$TMP/damaged.tar" .
if ./restore.sh "$TMP/damaged.tar" --yes 2>/dev/null; then fail "restored a damaged backup"; fi
cmp -s .env "$TMP/env.before" || fail "a refused restore changed .env"
ok "a damaged backup is refused and changes nothing"

# A new server: no volumes, new secrets.
docker compose down -v >/dev/null 2>&1
rm -f .env
./generate-env.sh >/dev/null
sed -i 's/^HSTS_MAX_AGE=.*/HSTS_MAX_AGE=0/' .env
docker compose up -d --wait --wait-timeout 900 >/dev/null
[ "$(psql_value 'SELECT count(*) FROM users;')" = 0 ] || fail "the new installation is not empty"
ok "fresh installation with new secrets is up"

./restore.sh "$BACKUP" --identity "$TMP/key.txt" --yes
cmp -s .env "$TMP/env.before" || fail ".env not restored"
curl -skf https://localhost/health >/dev/null || fail "not healthy after the restore"
fingerprint_db >"$TMP/db.after"
fingerprint_storage >"$TMP/storage.after"
diff -u "$TMP/db.before" "$TMP/db.after" || fail "database differs after the restore"
diff -u "$TMP/storage.before" "$TMP/storage.after" || fail "media differs after the restore"
# Row-level security came back with the data: the role, its grants and the policies.
[ "$(psql_value "SELECT pg_has_role(current_user, 'rubinny_tenant', 'MEMBER')
  AND has_table_privilege('rubinny_tenant', 'widgets', 'SELECT')
  AND (SELECT count(*) FROM pg_policies
         WHERE schemaname = current_schema() AND policyname = 'tenant_isolation') = 17;")" = t ] ||
  fail "row-level security is not complete after the restore"
ok "database, media and settings are identical after the restore; the stack is healthy"
rm -f .env.before-restore-*
