# Upgrading

[עברית למטה](#עברית)

## Every upgrade

1. **Back up first:** `./backup.sh --age-recipient <your key>` (see [OPERATIONS.md](OPERATIONS.md)).
2. **Read the release notes** in [CHANGELOG.md](../CHANGELOG.md) for steps specific to the version.
3. **Upgrade:**
   - **Building from source** (the default): update the code (`git pull` or the new release),
     then `docker compose up -d --build`.
   - **Running published images:** set `RUBINNY_VERSION` in `.env` to the new version, verify
     the signatures (below), then `docker compose pull && docker compose up -d`.

Database migrations run automatically when the server starts.

### Verifying published images

Release images on GHCR are signed keylessly with [Sigstore cosign](https://docs.sigstore.dev)
by the release workflow of this repository. To verify them before running:

```bash
for image in server worker web; do
  cosign verify "ghcr.io/diamondrubinny/rubinny/$image:0.2.0" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    --certificate-identity-regexp '^https://github\.com/diamondrubinny/freescreensign/\.github/workflows/release\.yml@'
done
```

A successful check prints the verified signature. If it fails, do not run the image. Each
release also lists its image digests (`images.txt`), SBOMs and `SHA256SUMS`.

## 0.1 → 0.2

- **Nothing to do for most installations:** the two new migrations (emergency alerts,
  row-level security) run when the server starts.
- **Row-level security** needs a database user that may create roles. The bundled PostgreSQL
  container has it. On a managed database without that permission the server logs
  `Row-level security is not active` and works as in 0.1 (see
  [OPERATIONS.md](OPERATIONS.md#database-isolation-row-level-security)).
- **arm64 servers** (Raspberry Pi 5, Apple Silicon, ARM cloud servers): set
  `CLAMAV_IMAGE=clamav/clamav-debian:stable` in `.env`; the default ClamAV image is amd64 only.
- **Screens** keep working with their current player. The alert layer needs the 0.2 player:
  web players update when the page reloads, the desktop and Android apps load the player from
  the server, so they update too.

## PostgreSQL 17 → 18 (Docker Compose deployments)

The Compose stack now uses `postgres:18-alpine` and mounts the database volume at
`/var/lib/postgresql` (the layout required by the official image from version 18).

A PostgreSQL major upgrade cannot read the old data files directly. If you already run
Rubinny, the new `postgres` container **refuses to start** on the old volume — your data is not
touched, but you must move it with a dump and restore. New installations need nothing.

Run everything from `deploy/`. Do steps 1–3 **before** pulling the new version.

```bash
# 1. Stop everything that writes to the database
docker compose stop web server worker

# 2. Back up the database (custom format) and check that the file is not empty
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > rubinny-pg17.dump
test -s rubinny-pg17.dump && echo "backup OK" || echo "BACKUP FAILED - do not continue"

# 3. Optional rollback copy of the raw PostgreSQL 17 volume
docker run --rm -v rubinny_postgres-data:/from:ro -v "$PWD":/to alpine \
  tar czf /to/rubinny-pg17-volume.tgz -C /from .

# 4. Stop the stack and remove the old volume (only after the backup above succeeded)
docker compose down
docker volume rm rubinny_postgres-data

# 5. Update Rubinny, start the new database and restore into it
git pull
docker compose up -d --wait postgres
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < rubinny-pg17.dump

# 6. Start everything
docker compose up -d --build
```

Keep `rubinny-pg17.dump` (it contains personal data — store it encrypted and delete it when
no longer needed). To roll back: check out the previous version, recreate the volume and
extract `rubinny-pg17-volume.tgz` into it.

## Valkey 8 → 9

No action needed: Valkey 9 reads the existing data (AOF/RDB) on the same volume.

---

<div dir="rtl">

## עברית

### שדרוג PostgreSQL 17 ל-18 (התקנה עם Docker Compose)

המערכת עוברת ל-`postgres:18-alpine`. נתיב ה-Volume של מסד הנתונים משתנה ל-`/var/lib/postgresql`, כי זה המבנה שהאימג' הרשמי דורש מגרסה 18.

**התקנה חדשה:** אין צורך לעשות דבר.

**התקנה קיימת:** שדרוג לגרסה ראשית חדשה של PostgreSQL לא יכול לקרוא ישירות את קבצי הנתונים הישנים. לכן הקונטיינר החדש **מסרב לעלות** על ה-Volume הישן. הנתונים לא נפגעים, אבל צריך להעביר אותם בגיבוי ושחזור.

מריצים את כל הפקודות מתוך התיקייה `deploy/`. את שלבים 1–3 מבצעים **לפני** שמושכים את הגרסה החדשה. אלה הפקודות שבבלוק למעלה:

1. עוצרים את השירותים שכותבים למסד.
2. מגבים עם `pg_dump` ובודקים שהקובץ לא ריק.
3. (רשות) שומרים עותק גולמי של ה-Volume, כדי שאפשר יהיה לחזור לגרסה הקודמת.
4. עוצרים את המערכת ומוחקים את ה-Volume הישן. עושים את זה רק אחרי שהגיבוי הצליח.
5. מעדכנים את הקוד (`git pull`), מעלים את מסד הנתונים החדש ומשחזרים לתוכו עם `pg_restore`.
6. מעלים את כל המערכת.

**קובץ הגיבוי** מכיל מידע אישי. שומרים אותו מוצפן, ומוחקים כשאין בו עוד צורך.

### שדרוג Valkey 8 ל-9

אין צורך לעשות דבר. Valkey 9 קורא את הנתונים הקיימים מאותו Volume.

</div>
