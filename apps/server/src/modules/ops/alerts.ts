// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { DEFAULT_LOCALE, isSupportedLocale } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { emitWebhookEvent } from '../integrations/events.js';

/** How often offline screens are looked for. */
export const ALERT_CHECK_INTERVAL_MS = 60_000;

interface AlertDeps {
  db: AppContext['db'];
  mailer: AppContext['mailer'];
  publicUrl: string;
}

/** Owners and admins with a verified address receive alerts, in their own language. */
async function recipients(deps: AlertDeps, orgId: string) {
  return deps.db
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .select(['users.email', 'users.locale'])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.role', 'in', ['OWNER', 'ADMIN'])
    .where('users.email_verified_at', 'is not', null)
    .execute();
}

const screensUrl = (deps: AlertDeps, orgId: string) =>
  `${new URL(deps.publicUrl).origin}/orgs/${orgId}/screens`;

/**
 * Sends one e-mail per organization listing screens that went offline. Each screen is
 * claimed atomically (offline_alerted_at), so it is reported once per outage, even with
 * several server instances. Nothing is reported until this process has been up for the
 * organization's delay, so a server restart does not alert about screens reconnecting.
 */
export async function runOfflineAlerts(
  deps: AlertDeps,
  startedAt: Date,
): Promise<{ orgs: number; screens: number }> {
  // Screens are claimed for organizations that want e-mails, or that have a webhook for
  // "screen.offline" (each outage is reported once, either way).
  const claimed = await sql<{
    id: string;
    name: string;
    org_id: string;
    org_name: string;
    minutes: number;
    emails: boolean;
  }>`
    UPDATE screens AS s
    SET offline_alerted_at = now()
    FROM organizations AS o
    WHERE s.org_id = o.id
      AND (
        o.offline_alerts
        OR EXISTS (
          SELECT 1 FROM webhooks w
          WHERE w.org_id = o.id AND w.enabled AND 'screen.offline' = ANY(w.events)
        )
      )
      AND o.deleted_at IS NULL
      AND s.offline_alerted_at IS NULL
      AND s.last_seen_at IS NOT NULL
      AND s.last_seen_at < now() - make_interval(mins => o.offline_alert_minutes)
      AND ${startedAt}::timestamptz < now() - make_interval(mins => o.offline_alert_minutes)
    RETURNING s.id, s.name, s.org_id, o.name AS org_name, o.offline_alert_minutes AS minutes,
      o.offline_alerts AS emails
  `.execute(deps.db);

  const byOrg = new Map<string, typeof claimed.rows>();
  for (const row of claimed.rows) {
    byOrg.set(row.org_id, [...(byOrg.get(row.org_id) ?? []), row]);
  }
  for (const [orgId, rows] of byOrg) {
    const first = rows[0];
    if (!first) continue;
    for (const row of rows) {
      await emitWebhookEvent(deps, orgId, 'screen.offline', {
        screen: { id: row.id, name: row.name },
        offlineMinutes: row.minutes,
      });
    }
    if (!first.emails) continue;
    for (const user of await recipients(deps, orgId)) {
      await deps.mailer.send(
        user.email,
        isSupportedLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
        {
          kind: 'screens-offline',
          orgName: first.org_name,
          screens: rows.map((row) => row.name).sort(),
          minutes: first.minutes,
          url: screensUrl(deps, orgId),
        },
      );
    }
  }
  return { orgs: byOrg.size, screens: claimed.rows.length };
}

/**
 * Called on every heartbeat: if the screen had been reported offline, clears the flag
 * (atomically, so only one heartbeat wins) and tells the same people it is back.
 */
export async function reportScreenBack(deps: AlertDeps, screenId: string): Promise<boolean> {
  const back = await deps.db
    .updateTable('screens')
    .set({ offline_alerted_at: null })
    .where('id', '=', screenId)
    .where('offline_alerted_at', 'is not', null)
    .returning(['name', 'org_id'])
    .executeTakeFirst();
  if (!back) return false;
  await emitWebhookEvent(deps, back.org_id, 'screen.online', {
    screen: { id: screenId, name: back.name },
  });
  const org = await deps.db
    .selectFrom('organizations')
    .select(['name', 'offline_alerts'])
    .where('id', '=', back.org_id)
    .executeTakeFirst();
  if (!org?.offline_alerts) return true;
  for (const user of await recipients(deps, back.org_id)) {
    await deps.mailer.send(
      user.email,
      isSupportedLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
      {
        kind: 'screens-online',
        orgName: org.name,
        screens: [back.name],
        url: screensUrl(deps, back.org_id),
      },
    );
  }
  return true;
}

/** Runs the offline check on a timer for the lifetime of the app. */
export function startOfflineAlerts(app: FastifyInstance, ctx: AppContext): void {
  const startedAt = new Date();
  const deps = { db: ctx.db, mailer: ctx.mailer, publicUrl: ctx.env.PUBLIC_URL };
  const timer = setInterval(() => {
    runOfflineAlerts(deps, startedAt)
      .then((result) => {
        if (result.screens > 0) app.log.info(result, 'offline alerts sent');
      })
      .catch((err: unknown) => {
        app.log.error({ err }, 'offline alert check failed');
      });
  }, ALERT_CHECK_INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
}
