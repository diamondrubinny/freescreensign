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
  cosign verify "ghcr.io/diamondrubinny/rubinny/$image:0.8.1" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    --certificate-identity-regexp '^https://github\.com/diamondrubinny/freescreensign/\.github/workflows/release\.yml@'
done
```

A successful check prints the verified signature. If it fails, do not run the image. Each
release also lists its image digests (`images.txt`), SBOMs and `SHA256SUMS`.

## 0.8.0 → 0.8.1

- **Nothing to do:** no migrations and no new settings. Screens update their player on their
  own; a screen whose meeting room was deleted then says the room is not available.

## 0.7.1 → 0.8.0

- **One database extension:** meeting rooms use `btree_gist` (so two bookings can never
  overlap). It is part of PostgreSQL's standard contrib modules and of the official images,
  and the migration creates it. On a managed database where the server's user cannot create
  extensions, the server stops at startup with a message saying so: run
  `CREATE EXTENSION btree_gist;` once in the database as an administrator, then start it
  again. **Check your provider's documentation that the extension is allowed** (most list it).
- **Nothing else to do:** rooms, bookings and the PIN start empty; booking at screens stays off
  until an admin sets a PIN.
- **Screens update on their own**, as since 0.7: the new widgets (meeting room, events
  calendar, building directory, synagogue times) need the 0.8 player, and an older player
  reloads when it reports in. Until a screen has updated, it shows nothing in their place.

## 0.7.0 → 0.7.1

- **Nothing to do:** no migrations and no new settings. Screens update their player on their
  own, as in 0.7.0; the screen's page then shows "Player version" 0.7.1.
- **Building from source** needs Node.js 22.22.2 or later (or 24.15 or later). The Docker
  images are not affected.

## 0.6 → 0.7

0.6.0 was not published as a release: upgrade from 0.4.1 straight to 0.7.0 (both sections
below apply).

- **Nothing to do:** no migrations. The new kits, the menu widget and the designer's effects
  are available after the upgrade.
- **Screens update on their own.** Content made with 0.7 (menus, the new kits, designs with
  gradients, transparency or small canvases) needs the 0.7 player; a 0.6 player shows nothing
  in its place. From 0.7 the server asks an older player to reload when it reports in, so web,
  desktop, Android, Samsung and LG players get the new code within minutes (at most about 10).
  A screen that is off during the upgrade gets it when it starts. To check, the screen's page
  shows "Player version" 0.7.0; **Reload player** on that page updates it at once.
- **Kit pictures need media storage** (as uploads do). Without it, kits are created without
  their art.

## 0.4 → 0.6

0.5.0 and 0.6.0 were not published: from 0.4.1, upgrade straight to 0.7 (this section and
the one above).

- **Nothing to do for most installations:** three migrations (time windows of playlist
  items, screen groups with row-level security, the operator and backup records) run when
  the server starts.
- **Time windows need the 0.6 player.** Web players update when the page reloads; the desktop
  and Android apps load the player from the server. An older player ignores windows and
  shows every item, except items whose last date has passed (the server leaves those out).
- **Check each screen's time zone** in "Edit screen": until now every screen used
  Asia/Jerusalem. Screens outside Israel should get their own zone, so that schedules and
  time windows follow their local clock.
- **The operator** is your oldest account. Check with `./set-operator.sh --list`, and add or
  remove operators with `./set-operator.sh` (see [OPERATIONS.md](OPERATIONS.md#server-status-page-operator)).
- **Update the deploy folder** (`backup.sh`, the new `set-operator.sh`): from 0.6
  `backup.sh` records each backup for the status page.
- **New: Samsung and LG screens** ([guide](players.md#samsung-and-lg-screens)). Existing
  screens need nothing: the player is now also built for older browser engines (Chromium 69),
  and works as before on newer ones.

## 0.4 → 0.4.1

- **Nothing to do:** no migrations and no new settings. Pending approval requests of people
  who already left an organization stay as they are; new departures withdraw them.

## 0.3 → 0.4

- **Nothing to do for most installations:** the four new migrations (approval claims, touch
  actions, video walls, AI settings) run when the server starts.
- **Touch screens and video walls** need the 0.4 player. Web players update when the page
  reloads; the desktop and Android apps load the player from the server.
- **Writing suggestions (AI) are off** in every organization until an admin turns them on with
  the organization's own key. The server then connects to `api.anthropic.com` (HTTPS); allow it
  in an outbound firewall if you use one. Turning it on sends content to a provider abroad:
  requires legal review (see [OPERATIONS.md](OPERATIONS.md#writing-suggestions-ai-bring-your-own-key)).
- **Keep `ENCRYPTION_KEY`:** AI keys are encrypted with it, like other stored secrets.

## 0.2 → 0.3

- **Nothing to do for most installations:** the three new migrations (linked sign-in
  identities and approval requests) run when the server starts.
- **SSO is off** until `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are set (see
  [OPERATIONS.md](OPERATIONS.md#sign-in-through-your-organization-sso)).
- **Content approval is off** in every organization until an admin turns it on in the
  organization settings.
- **Database timeouts:** the server now waits at most 10 s for a database connection, and asks
  PostgreSQL to end a transaction left idle for 60 s. A database proxy that does not pass
  startup parameters (for example PgBouncer in transaction mode) ignores the second one.

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
