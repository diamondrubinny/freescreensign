// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { safeEqual } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { hashPassword } from '../../lib/password.js';
import { parse } from '../../lib/validation.js';
import { publicUser } from '../auth/dto.js';
import { assertPasswordAcceptable } from '../auth/password-policy.js';
import { emailSchema, localeSchema, nameSchema, passwordSchema } from '../auth/schemas.js';
import { clientIp, createSession } from '../auth/sessions.js';

export function setupRoutes(app: FastifyInstance, ctx: AppContext) {
  async function hasUsers(): Promise<boolean> {
    const row = await ctx.db.selectFrom('users').select('id').limit(1).executeTakeFirst();
    return row !== undefined;
  }

  app.get('/api/v1/setup/status', async () => ({
    needsSetup: !(await hasUsers()),
    setupTokenRequired: ctx.env.SETUP_TOKEN !== undefined,
  }));

  app.post('/api/v1/setup', async (request, reply) => {
    await ctx.limiter.hit(LIMITS.setupIp, ctx.keys.hashIp(clientIp(request)));
    const body = parse(
      z.object({
        setupToken: z.string().max(200).optional(),
        email: emailSchema,
        password: passwordSchema,
        name: nameSchema,
        orgName: nameSchema,
        locale: localeSchema.default('he'),
      }),
      request.body,
    );

    if (
      ctx.env.SETUP_TOKEN !== undefined &&
      !safeEqual(body.setupToken ?? '', ctx.env.SETUP_TOKEN)
    ) {
      throw new HttpError(403, 'FORBIDDEN', 'Invalid setup token');
    }
    assertPasswordAcceptable(body.password, body.email);
    const passwordHash = await hashPassword(body.password);

    const { user, orgId } = await ctx.db.transaction().execute(async (trx) => {
      // Serialize concurrent setup attempts; only the first one can succeed.
      await sql`SELECT pg_advisory_xact_lock(hashtext('rubinny-setup'))`.execute(trx);
      const existing = await trx.selectFrom('users').select('id').limit(1).executeTakeFirst();
      if (existing) throw new HttpError(409, 'CONFLICT', 'Setup has already been completed');

      const created = await trx
        .insertInto('users')
        .values({
          email: body.email,
          name: body.name,
          password_hash: passwordHash,
          locale: body.locale,
          email_verified_at: new Date(),
          // Whoever installs the system operates it (the server status page).
          is_operator: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const org = await trx
        .insertInto('organizations')
        .values({ name: body.orgName })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('memberships')
        .values({ org_id: org.id, user_id: created.id, role: 'OWNER' })
        .execute();
      return { user: created, orgId: org.id };
    });

    await audit(ctx.db, { action: 'setup.completed', orgId, actorUserId: user.id });
    await createSession(ctx, request, reply, user.id);
    return reply.status(201).send({ user: publicUser(user) });
  });
}
