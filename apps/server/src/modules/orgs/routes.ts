import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROLES, hasRole, type Locale } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { audit } from '../../lib/audit.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { emailSchema, nameSchema, tokenSchema } from '../auth/schemas.js';
import { clientIp } from '../auth/sessions.js';
import { appLink } from '../auth/tokens.js';
import { INVITATION_TTL_MS, acceptInvitation, findValidInvitation } from './invitations.js';

const roleSchema = z.enum(ROLES);
const userParams = z.object({ orgId: z.uuid(), userId: z.uuid() });
const invitationParams = z.object({ orgId: z.uuid(), invitationId: z.uuid() });

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');

export function orgRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };

  async function countOwners(orgId: string): Promise<number> {
    const row = await ctx.db
      .selectFrom('memberships')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', orgId)
      .where('role', '=', 'OWNER')
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  // ------------------------------------------------------------------- orgs
  app.post('/api/v1/orgs', async (request, reply) => {
    const { user } = requireAuth(request);
    const { name } = parse(z.object({ name: nameSchema }), request.body);
    const owned = await ctx.db
      .selectFrom('memberships')
      .innerJoin('organizations', 'organizations.id', 'memberships.org_id')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('memberships.user_id', '=', user.id)
      .where('memberships.role', '=', 'OWNER')
      .where('organizations.deleted_at', 'is', null)
      .executeTakeFirstOrThrow();
    if (Number(owned.count) >= ctx.env.MAX_ORGS_PER_USER) {
      throw new HttpError(403, 'QUOTA_EXCEEDED', 'Organization limit reached');
    }
    const org = await ctx.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('organizations')
        .values({ name })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('memberships')
        .values({ org_id: created.id, user_id: user.id, role: 'OWNER' })
        .execute();
      return created;
    });
    await audit(ctx.db, { action: 'org.created', orgId: org.id, actorUserId: user.id });
    return reply.status(201).send({
      org: { id: org.id, name: org.name, requireAdminMfa: org.require_admin_mfa, role: 'OWNER' },
    });
  });

  app.get('/api/v1/orgs/:orgId', viewer, (request) => ({ org: requireOrg(request) }));

  app.patch('/api/v1/orgs/:orgId', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(
      z
        .object({ name: nameSchema.optional(), requireAdminMfa: z.boolean().optional() })
        .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' }),
      request.body,
    );
    if (body.requireAdminMfa !== undefined && org.role !== 'OWNER') {
      throw new HttpError(403, 'FORBIDDEN', 'Only owners can change the MFA policy');
    }
    const updated = await ctx.db
      .updateTable('organizations')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.requireAdminMfa !== undefined ? { require_admin_mfa: body.requireAdminMfa } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', org.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      action: 'org.updated',
      orgId: org.id,
      actorUserId: user.id,
      meta: { fields: Object.keys(body) },
    });
    return {
      org: {
        id: updated.id,
        name: updated.name,
        requireAdminMfa: updated.require_admin_mfa,
        role: org.role,
      },
    };
  });

  // ---------------------------------------------------------------- members
  app.get('/api/v1/orgs/:orgId/members', admin, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.user_id')
      .select([
        'users.id',
        'users.email',
        'users.name',
        'users.mfa_enabled_at',
        'memberships.role',
        'memberships.created_at',
      ])
      .where('memberships.org_id', '=', org.id)
      .where('users.deleted_at', 'is', null)
      .orderBy('users.name')
      .execute();
    return {
      members: rows.map((row) => ({
        userId: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        mfaEnabled: row.mfa_enabled_at !== null,
        joinedAt: row.created_at.toISOString(),
      })),
    };
  });

  app.patch('/api/v1/orgs/:orgId/members/:userId', admin, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { userId } = parse(userParams, request.params);
    const { role } = parse(z.object({ role: roleSchema }), request.body);

    const target = await ctx.db
      .selectFrom('memberships')
      .select('role')
      .where('org_id', '=', org.id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!target) throw notFound();
    if ((target.role === 'OWNER' || role === 'OWNER') && org.role !== 'OWNER') {
      throw new HttpError(403, 'FORBIDDEN', 'Only owners can manage owners');
    }
    if (target.role === 'OWNER' && role !== 'OWNER' && (await countOwners(org.id)) <= 1) {
      throw new HttpError(409, 'CONFLICT', 'An organization must keep at least one owner');
    }
    await ctx.db
      .updateTable('memberships')
      .set({ role })
      .where('org_id', '=', org.id)
      .where('user_id', '=', userId)
      .execute();
    await audit(ctx.db, {
      action: 'member.role_changed',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'user',
      targetId: userId,
      meta: { from: target.role, to: role },
    });
    return { userId, role };
  });

  // Any member may leave; admins may remove others (owners only by owners).
  app.delete('/api/v1/orgs/:orgId/members/:userId', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { userId } = parse(userParams, request.params);
    const self = userId === user.id;

    if (!self && !hasRole(org.role, 'ADMIN')) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action');
    }
    if (!self) await orgGuard(ctx, 'ADMIN')(request); // also enforces admin MFA policy

    const target = await ctx.db
      .selectFrom('memberships')
      .select('role')
      .where('org_id', '=', org.id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!target) throw notFound();
    if (target.role === 'OWNER' && !self && org.role !== 'OWNER') {
      throw new HttpError(403, 'FORBIDDEN', 'Only owners can manage owners');
    }
    if (target.role === 'OWNER' && (await countOwners(org.id)) <= 1) {
      throw new HttpError(409, 'CONFLICT', 'An organization must keep at least one owner');
    }
    await ctx.db
      .deleteFrom('memberships')
      .where('org_id', '=', org.id)
      .where('user_id', '=', userId)
      .execute();
    await audit(ctx.db, {
      action: 'member.removed',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'user',
      targetId: userId,
      meta: { self },
    });
    return reply.status(204).send();
  });

  // ------------------------------------------------------------ invitations
  app.get('/api/v1/orgs/:orgId/invitations', admin, async (request) => {
    const org = requireOrg(request);
    const rows = await ctx.db
      .selectFrom('invitations')
      .select(['id', 'email', 'role', 'expires_at', 'created_at', 'delivered_by_email'])
      .where('org_id', '=', org.id)
      .where('accepted_at', 'is', null)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .execute();
    return {
      invitations: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        deliveredByEmail: row.delivered_by_email,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      })),
    };
  });

  app.post('/api/v1/orgs/:orgId/invitations', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.emailSendIp, ctx.keys.hashIp(clientIp(request)));
    const body = parse(
      z.object({
        email: emailSchema,
        role: roleSchema,
        locale: z.enum(['he', 'en']).optional(),
      }),
      request.body,
    );
    if (body.role === 'OWNER' && org.role !== 'OWNER') {
      throw new HttpError(403, 'FORBIDDEN', 'Only owners can invite owners');
    }
    const alreadyMember = await ctx.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.user_id')
      .select('users.id')
      .where('memberships.org_id', '=', org.id)
      .where('users.email', '=', body.email)
      .executeTakeFirst();
    if (alreadyMember) throw new HttpError(409, 'CONFLICT', 'This person is already a member');

    const token = randomToken();
    const invitation = await ctx.db.transaction().execute(async (trx) => {
      // A new invitation replaces any pending one for the same address.
      await trx
        .updateTable('invitations')
        .set({ revoked_at: new Date() })
        .where('org_id', '=', org.id)
        .where('email', '=', body.email)
        .where('accepted_at', 'is', null)
        .where('revoked_at', 'is', null)
        .execute();
      return trx
        .insertInto('invitations')
        .values({
          org_id: org.id,
          email: body.email,
          role: body.role,
          token_hash: sha256Hex(token),
          invited_by: user.id,
          delivered_by_email: ctx.mailer.delivers,
          expires_at: new Date(Date.now() + INVITATION_TTL_MS),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    const url = appLink(ctx, '/accept-invitation', token);
    const locale: Locale = body.locale ?? (user.locale === 'en' ? 'en' : 'he');
    await ctx.mailer.send(body.email, locale, {
      kind: 'invitation',
      url,
      orgName: org.name,
      inviterName: user.name,
    });
    await audit(ctx.db, {
      action: 'invitation.created',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'invitation',
      targetId: invitation.id,
      meta: { role: body.role },
    });
    return reply.status(201).send({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        deliveredByEmail: invitation.delivered_by_email,
        expiresAt: invitation.expires_at.toISOString(),
      },
      // Without outgoing mail the admin must share the link manually.
      ...(ctx.mailer.delivers ? {} : { inviteUrl: url }),
    });
  });

  app.delete('/api/v1/orgs/:orgId/invitations/:invitationId', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { invitationId } = parse(invitationParams, request.params);
    const result = await ctx.db
      .updateTable('invitations')
      .set({ revoked_at: new Date() })
      .where('id', '=', invitationId)
      .where('org_id', '=', org.id)
      .where('accepted_at', 'is', null)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw notFound();
    await audit(ctx.db, {
      action: 'invitation.revoked',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'invitation',
      targetId: invitationId,
    });
    return reply.status(204).send();
  });

  app.post('/api/v1/invitations/accept', async (request) => {
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.tokenRedeemIp, ctx.keys.hashIp(clientIp(request)));
    const { token } = parse(z.object({ token: tokenSchema }), request.body);
    const invitation = await findValidInvitation(ctx, token);
    // Same error for unknown, expired and other-address invitations.
    if (invitation?.email !== user.email) {
      throw new HttpError(400, 'INVALID_TOKEN', 'The invitation is invalid or has expired');
    }
    const accepted = await ctx.db.transaction().execute(async (trx) => {
      const ok = await acceptInvitation(trx, invitation, user.id);
      if (ok && invitation.delivered_by_email && !user.email_verified_at) {
        await trx
          .updateTable('users')
          .set({ email_verified_at: new Date() })
          .where('id', '=', user.id)
          .execute();
      }
      return ok;
    });
    if (!accepted)
      throw new HttpError(400, 'INVALID_TOKEN', 'The invitation is invalid or has expired');
    await audit(ctx.db, {
      action: 'invitation.accepted',
      orgId: invitation.org_id,
      actorUserId: user.id,
      targetType: 'invitation',
      targetId: invitation.id,
    });
    return { orgId: invitation.org_id, role: invitation.role };
  });

  // ------------------------------------------------------------------ audit
  app.get('/api/v1/orgs/:orgId/audit', admin, async (request) => {
    const org = requireOrg(request);
    const query = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z
          .string()
          .regex(/^\d{1,19}$/)
          .optional(),
      }),
      request.query,
    );
    let q = ctx.db
      .selectFrom('audit_logs')
      .leftJoin('users', 'users.id', 'audit_logs.actor_user_id')
      .select([
        'audit_logs.id',
        'audit_logs.action',
        'audit_logs.actor_user_id',
        'users.name as actor_name',
        'audit_logs.target_type',
        'audit_logs.target_id',
        'audit_logs.meta',
        'audit_logs.created_at',
      ])
      .where('audit_logs.org_id', '=', org.id)
      .orderBy('audit_logs.id', 'desc')
      .limit(query.limit + 1);
    if (query.before) q = q.where('audit_logs.id', '<', query.before);
    const rows = await q.execute();
    const page = rows.slice(0, query.limit);
    return {
      events: page.map((row) => ({
        id: row.id,
        action: row.action,
        actorUserId: row.actor_user_id,
        actorName: row.actor_name,
        targetType: row.target_type,
        targetId: row.target_id,
        meta: row.meta,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  });
}
