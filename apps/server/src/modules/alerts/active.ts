import { sql } from 'kysely';
import { pickAlert, type ManifestAlert } from '@rubinny/shared';
import type { Db } from '../../db/database.js';

/** Alerts of an organization that are on screens now (started, not ended, not expired). */
export function activeAlertsQuery(db: Db, orgId: string) {
  return db
    .selectFrom('alerts')
    .where('org_id', '=', orgId)
    .where('ended_at', 'is', null)
    .where('starts_at', '<=', sql<Date>`now()`)
    .where((eb) => eb.or([eb('ends_at', 'is', null), eb('ends_at', '>', sql<Date>`now()`)]));
}

/** The alert a screen shows, if any. */
export async function alertForScreen(
  db: Db,
  screen: { id: string; org_id: string },
): Promise<ManifestAlert | null> {
  const rows = await activeAlertsQuery(db, screen.org_id)
    .select(['id', 'style', 'title', 'message', 'starts_at', 'ends_at'])
    .where((eb) =>
      eb.or([eb('screen_ids', 'is', null), sql<boolean>`${screen.id}::uuid = ANY (screen_ids)`]),
    )
    .execute();
  const best = pickAlert(rows.map((row) => ({ ...row, startsAt: row.starts_at })));
  if (!best) return null;
  return {
    id: best.id,
    style: best.style,
    title: best.title,
    message: best.message,
    endsAt: best.ends_at?.toISOString() ?? null,
  };
}
