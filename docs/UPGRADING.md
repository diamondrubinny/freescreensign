# Upgrading

[עברית למטה](#עברית)

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
