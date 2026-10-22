// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { randomToken } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { parse } from '../../lib/validation.js';
import { publicUser } from '../auth/dto.js';
import { requireAuth } from '../auth/guards.js';
import { listMemberships } from '../auth/routes.js';
import { localeSchema, nameSchema, passwordSchema } from '../auth/schemas.js';
import { clearSessionCookie } from '../auth/sessions.js';

/** Public, non-secret identifier for a session (prefix of the token hash). */
const sessionPublicId = (idHash: string) => idHash.slice(0, 16);
/** An SSO account without a password confirms account deletion by a recent sign-in. */
const REAUTH_WINDOW_MS = 15 * 60 * 1000;

export function meRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/v1/me', (request) => ({ user: publicUser(requireAuth(request).user) }));

  app.patch('/api/v1/me', async (request) => {
    const { user } = requireAuth(request);
    const body = parse(
      z
        .object({ name: nameSchema.optional(), locale: localeSchema.optional() })
        .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    const updated = await ctx.db
      .updateTable('users')
      .set({ ...body, updated_at: new Date() })
      .where('id', '=', user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'user.updated',
      actorUserId: user.id,
      meta: { fields: Object.keys(body) },
    });
    return { user: publicUser(updated) };
  });

  app.get('/api/v1/me/sessions', async (request) => {
    const { user, sessionIdHash } = requireAuth(request);
    const rows = await ctx.db
      .selectFrom('sessions')
      .select(['id_hash', 'created_at', 'last_seen_at', 'expires_at', 'user_agent'])
      .where('user_id', '=', user.id)
      .where('expires_at', '>', new Date())
      .orderBy('last_seen_at', 'desc')
      .execute();
    return {
      sessions: rows.map((row) => ({
        id: sessionPublicId(row.id_hash),
        current: row.id_hash === sessionIdHash,
        userAgent: row.user_agent,
        createdAt: row.created_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
      })),
    };
  });

  app.delete('/api/v1/me/sessions/:sessionId', async (request, reply) => {
    const { user } = requireAuth(request);
    const { sessionId } = parse(
      z.object({ sessionId: z.string().regex(/^[a-f0-9]{16}$/) }),
      request.params,
    );
    const result = await ctx.db
      .deleteFrom('sessions')
      .where('user_id', '=', user.id)
      .where('id_hash', 'like', `${sessionId}%`)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    await audit(ctx.db, { action: 'user.session_revoked', actorUserId: user.id });
    return reply.status(204).send();
  });

  // ------------------------------------------------- linked SSO identities
  app.get('/api/v1/me/identities', async (request) => {
    const { user } = requireAuth(request);
    const rows = await ctx.db
      .selectFrom('user_identities')
      .select(['id', 'issuer', 'email', 'created_at', 'last_used_at'])
      .where('user_id', '=', user.id)
      .orderBy('created_at')
      .execute();
    return {
      identities: rows.map((row) => ({
        id: row.id,
        issuer: row.issuer,
        email: row.email,
        createdAt: row.created_at.toISOString(),
        lastUsedAt: row.last_used_at.toISOString(),
      })),
    };
  });

  app.delete('/api/v1/me/identities/:identityId', async (request, reply) => {
    const { user } = requireAuth(request);
    const { identityId } = parse(z.object({ identityId: z.uuid() }), request.params);
    const identities = await ctx.db
      .selectFrom('user_identities')
      .select('id')
      .where('user_id', '=', user.id)
      .execute();
    if (!identities.some((row) => row.id === identityId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    }
    // Never lock the user out: keep at least one way to sign in.
    if (!user.password_login && identities.length === 1) {
      throw new HttpError(409, 'CONFLICT', 'Set a password before unlinking your only sign-in', [
        { path: 'identityId', reason: 'last_sign_in_method' },
      ]);
    }
    await ctx.db
      .deleteFrom('user_identities')
      .where('id', '=', identityId)
      .where('user_id', '=', user.id)
      .execute();
    await audit(ctx.db, { action: 'user.identity_unlinked', actorUserId: user.id });
    return reply.status(204).send();
  });

  /** Right of access / data portability: everything we hold about the caller. */
  app.get('/api/v1/me/export', async (request, reply) => {
    const { user } = requireAuth(request);
    const [memberships, sessions, events, identities, approvals] = await Promise.all([
      listMemberships(ctx, user.id),
      ctx.db
        .selectFrom('sessions')
        .select(['created_at', 'last_seen_at', 'expires_at', 'user_agent'])
        .where('user_id', '=', user.id)
        .execute(),
      ctx.db
        .selectFrom('audit_logs')
        .select(['action', 'org_id', 'target_type', 'target_id', 'created_at'])
        .where('actor_user_id', '=', user.id)
        .orderBy('id', 'desc')
        .limit(10_000)
        .execute(),
      ctx.db
        .selectFrom('user_identities')
        .select(['issuer', 'subject', 'email', 'created_at', 'last_used_at'])
        .where('user_id', '=', user.id)
        .execute(),
      // Changes the caller asked for or decided (the change itself is organization content).
      ctx.db
        .selectFrom('approval_requests')
        .select([
          'org_id',
          'summary',
          'status',
          'requested_by',
          'requested_at',
          'decided_by',
          'decided_at',
          'note',
        ])
        .where((eb) => eb.or([eb('requested_by', '=', user.id), eb('decided_by', '=', user.id)]))
        .orderBy('requested_at', 'desc')
        .limit(10_000)
        .execute(),
    ]);
    await audit(ctx.db, { action: 'user.exported', actorUserId: user.id });
    void reply.header('content-disposition', 'attachment; filename="rubinny-my-data.json"');
    return {
      exportedAt: new Date().toISOString(),
      profile: { ...publicUser(user), updatedAt: user.updated_at.toISOString() },
      memberships,
      sessions,
      identities,
      approvals: approvals.map(({ requested_by, decided_by, ...row }) => ({
        ...row,
        requestedByMe: requested_by === user.id,
        decidedByMe: decided_by === user.id,
      })),
      activity: events,
    };
  });

  /** Right to erasure: anonymizes the account and removes credentials. */
  app.delete('/api/v1/me', async (request, reply) => {
    const { user, sessionIdHash } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.passwordChangeUser, user.id);
    if (user.password_login) {
      const { password } = parse(z.object({ password: passwordSchema }), request.body);
      if (!(await verifyPassword(user.password_hash, password))) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
      }
    } else {
      // No password (an SSO account): a sign-in within the last minutes confirms it is them.
      const session = await ctx.db
        .selectFrom('sessions')
        .select('created_at')
        .where('id_hash', '=', sessionIdHash)
        .executeTakeFirst();
      if (!session || Date.now() - session.created_at.getTime() > REAUTH_WINDOW_MS) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Sign in again to confirm', [
          { path: 'session', reason: 'reauthenticate' },
        ]);
      }
    }

    const owned = await ctx.db
      .selectFrom('memberships as mine')
      .innerJoin('organizations', 'organizations.id', 'mine.org_id')
      .select([
        'mine.org_id',
        (eb) =>
          eb
            .selectFrom('memberships as other')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('other.org_id', '=', 'mine.org_id')
            .where('other.user_id', '!=', user.id)
            .as('other_members'),
        (eb) =>
          eb
            .selectFrom('memberships as other')
            .select((inner) => inner.fn.countAll<string>().as('count'))
            .whereRef('other.org_id', '=', 'mine.org_id')
            .where('other.user_id', '!=', user.id)
            .where('other.role', '=', 'OWNER')
            .as('other_owners'),
      ])
      .where('mine.user_id', '=', user.id)
      .where('mine.role', '=', 'OWNER')
      .where('organizations.deleted_at', 'is', null)
      .execute();

    if (owned.some((row) => Number(row.other_members) > 0 && Number(row.other_owners) === 0)) {
      throw new HttpError(
        409,
        'CONFLICT',
        'Transfer ownership of your organizations before deleting your account',
      );
    }
    const soloOrgIds = owned
      .filter((row) => Number(row.other_members) === 0)
      .map((row) => row.org_id);

    await ctx.db.transaction().execute(async (trx) => {
      if (soloOrgIds.length > 0) {
        await trx
          .updateTable('organizations')
          .set({ deleted_at: new Date(), name: 'Deleted organization' })
          .where('id', 'in', soloOrgIds)
          .execute();
      }
      await trx
        .updateTable('approval_requests')
        .set({ status: 'withdrawn', decided_by: user.id, decided_at: new Date() })
        .where('requested_by', '=', user.id)
        .where('status', '=', 'pending')
        .execute();
      await trx.deleteFrom('memberships').where('user_id', '=', user.id).execute();
      await trx.deleteFrom('sessions').where('user_id', '=', user.id).execute();
      await trx.deleteFrom('user_tokens').where('user_id', '=', user.id).execute();
      await trx.deleteFrom('recovery_codes').where('user_id', '=', user.id).execute();
      await trx.deleteFrom('user_identities').where('user_id', '=', user.id).execute();
      await trx
        .updateTable('users')
        .set({
          email: `deleted-${user.id}@deleted.invalid`,
          name: 'Deleted user',
          // Unusable password: a random value that is never shown to anyone.
          password_hash: await hashPassword(randomToken()),
          mfa_secret_enc: null,
          mfa_pending_secret_enc: null,
          mfa_enabled_at: null,
          mfa_last_step: null,
          is_operator: false,
          deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', user.id)
        .execute();
    });
    await audit(ctx.db, { action: 'user.deleted', actorUserId: user.id });
    clearSessionCookie(ctx.env, reply);
    return reply.status(204).send();
  });
}
