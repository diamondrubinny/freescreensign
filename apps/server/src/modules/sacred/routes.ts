// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  SACRED_LIMITS,
  localDateSchema,
  sacredSettingsSchema,
  zonedTime,
  type SacredSettings,
} from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Db } from '../../db/database.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { notifyScreens } from '../screens/notify.js';
import { computeSacredTimes } from './periods.js';

/** The organization's Shabbat and holiday settings, or null when not set (or invalid). */
export async function orgSacredSettings(db: Db, orgId: string): Promise<SacredSettings | null> {
  const row = await db
    .selectFrom('organizations')
    .select('sacred_settings')
    .where('id', '=', orgId)
    .executeTakeFirst();
  const parsed = sacredSettingsSchema.safeParse(row?.sacred_settings);
  return parsed.success ? parsed.data : null;
}

/**
 * Rules that depend on Shabbat and holidays need the organization's place first (otherwise
 * "only" would never show): `paths` are the fields that use the condition.
 */
export async function assertSacredAvailable(
  db: Db,
  orgId: string,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;
  if (await orgSacredSettings(db, orgId)) return;
  throw new HttpError(
    400,
    'VALIDATION_FAILED',
    'Set the place for Shabbat and holidays in the organization settings first',
    paths.map((path) => ({ path, reason: 'sacred_unavailable' })),
  );
}

export function sacredRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };

  app.get('/api/v1/orgs/:orgId/settings/sacred', viewer, async (request) => {
    const org = requireOrg(request);
    return { settings: await orgSacredSettings(ctx.db, org.id) };
  });

  /** Sets (or clears, with null) the place and method; every screen gets new periods. */
  app.put('/api/v1/orgs/:orgId/settings/sacred', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { settings } = parse(
      z.object({ settings: sacredSettingsSchema.nullable() }),
      request.body,
    );
    await ctx.db
      .updateTable('organizations')
      .set({
        sacred_settings: settings ? JSON.stringify(settings) : null,
        updated_at: new Date(),
      })
      .where('id', '=', org.id)
      .execute();
    const screens = await ctx.db
      .selectFrom('screens')
      .select('id')
      .where('org_id', '=', org.id)
      .execute();
    await notifyScreens(
      ctx,
      screens.map((screen) => screen.id),
    );
    await audit(ctx.db, {
      action: 'org.updated',
      orgId: org.id,
      actorUserId: user.id,
      meta: { fields: ['sacredSettings'], sacred: settings ? 'set' : 'cleared' },
    });
    return { settings };
  });

  /** Periods for the dashboard's timeline, from a date (the place's) for some days. */
  app.get('/api/v1/orgs/:orgId/sacred-times', viewer, async (request) => {
    const org = requireOrg(request);
    const query = parse(
      z.object({
        from: localDateSchema.optional(),
        days: z.coerce.number().int().min(1).max(SACRED_LIMITS.days).default(14),
      }),
      request.query,
    );
    const settings = await orgSacredSettings(ctx.db, org.id);
    if (!settings) return { timeZone: null, times: null };
    const timeZone = settings.place.timezone;
    const now = query.from ? new Date(zonedTime(query.from, 12 * 60, timeZone)) : new Date();
    return { timeZone, times: computeSacredTimes(settings, now, query.days) };
  });
}
