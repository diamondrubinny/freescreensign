// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Locale } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { User } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/password.js';
import { generateTotpSecret, totpUri, base32Decode, verifyTotp } from '../../lib/totp.js';
import { parse } from '../../lib/validation.js';
import { publicUser } from './dto.js';
import { requireAuth } from './guards.js';
import { consumeRecoveryCode, mfaAad, regenerateRecoveryCodes, verifyUserTotp } from './mfa.js';
import { assertPasswordAcceptable } from './password-policy.js';
import {
  emailSchema,
  localeSchema,
  nameSchema,
  passwordSchema,
  recoveryCodeSchema,
  tokenSchema,
  totpCodeSchema,
} from './schemas.js';
import { clearSessionCookie, clientIp, createSession, revokeUserSessions } from './sessions.js';
import { appLink, consumeToken, issueToken } from './tokens.js';
import { findValidInvitation, acceptInvitation } from '../orgs/invitations.js';
import { oidcEnabled } from './oidc.js';

const asLocale = (value: string): Locale => (value === 'en' ? 'en' : 'he');

/**
 * Email verification can only be enforced when the server can send email. With
 * mail disabled, administrators hand out invitation links personally, and
 * addresses stay marked as unverified (email_verified_at = null).
 */
export function verificationEnforced(ctx: AppContext): boolean {
  return ctx.env.REQUIRE_EMAIL_VERIFICATION && ctx.mailer.delivers;
}

export async function listMemberships(ctx: AppContext, userId: string) {
  const rows = await ctx.db
    .selectFrom('memberships')
    .innerJoin('organizations', 'organizations.id', 'memberships.org_id')
    .select([
      'organizations.id',
      'organizations.name',
      'organizations.require_admin_mfa',
      'organizations.require_approval',
      'memberships.role',
    ])
    .where('memberships.user_id', '=', userId)
    .where('organizations.deleted_at', 'is', null)
    .orderBy('organizations.name')
    .execute();
  return rows.map((row) => ({
    orgId: row.id,
    name: row.name,
    role: row.role,
    requireAdminMfa: row.require_admin_mfa,
    requireApproval: row.require_approval,
  }));
}

async function findActiveUserByEmail(ctx: AppContext, email: string) {
  return ctx.db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

async function sendSecurityNotice(
  ctx: AppContext,
  user: User,
  event: 'password-changed' | 'mfa-enabled' | 'mfa-disabled',
) {
  await ctx.mailer.send(user.email, asLocale(user.locale), { kind: 'security-notice', event });
}

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const ipKey = (request: FastifyRequest) => ctx.keys.hashIp(clientIp(request));

  async function startSession(request: FastifyRequest, reply: FastifyReply, user: User) {
    await createSession(ctx, request, reply, user.id);
    await audit(ctx.db, {
      action: 'auth.login.success',
      actorUserId: user.id,
      ipHmac: ipKey(request),
    });
    return {
      mfaRequired: false as const,
      user: publicUser(user),
      memberships: await listMemberships(ctx, user.id),
    };
  }

  // ---------------------------------------------------------------- register
  app.post('/api/v1/auth/register', async (request, reply) => {
    await ctx.limiter.hit(LIMITS.registerIp, ipKey(request));
    const body = parse(
      z.object({
        email: emailSchema,
        password: passwordSchema,
        name: nameSchema,
        locale: localeSchema.optional(),
        orgName: nameSchema.optional(),
        inviteToken: tokenSchema.optional(),
      }),
      request.body,
    );

    if (!body.inviteToken && ctx.env.REGISTRATION_MODE !== 'open') {
      throw new HttpError(403, 'REGISTRATION_CLOSED', 'Registration requires an invitation');
    }
    if (ctx.env.REGISTRATION_MODE === 'closed') {
      throw new HttpError(403, 'REGISTRATION_CLOSED', 'Registration is closed');
    }

    const invitation = body.inviteToken
      ? await findValidInvitation(ctx, body.inviteToken)
      : undefined;
    if (body.inviteToken && invitation?.email !== body.email) {
      throw new HttpError(400, 'INVALID_TOKEN', 'The invitation is invalid or has expired');
    }
    assertPasswordAcceptable(body.password, body.email);

    const locale = body.locale ?? 'he';
    const existing = await findActiveUserByEmail(ctx, body.email);
    if (existing) {
      // Same work and the same response as a new registration: no account enumeration.
      await hashPassword(body.password);
      await ctx.mailer.send(existing.email, asLocale(existing.locale), {
        kind: 'account-exists',
        loginUrl: appLink(ctx, '/login'),
        resetUrl: appLink(ctx, '/forgot-password'),
      });
      return reply.status(202).send({ status: 'verification_required' });
    }

    const verified = invitation?.delivered_by_email === true;
    const canSignIn = verified || !verificationEnforced(ctx);
    const passwordHash = await hashPassword(body.password);

    const user = await ctx.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('users')
        .values({
          email: body.email,
          name: body.name,
          password_hash: passwordHash,
          locale,
          email_verified_at: verified || !ctx.env.REQUIRE_EMAIL_VERIFICATION ? new Date() : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (invitation) {
        if (!(await acceptInvitation(trx, invitation, created.id))) {
          throw new HttpError(400, 'INVALID_TOKEN', 'The invitation is invalid or has expired');
        }
      } else {
        const org = await trx
          .insertInto('organizations')
          .values({ name: body.orgName ?? body.name })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('memberships')
          .values({ org_id: org.id, user_id: created.id, role: 'OWNER' })
          .execute();
      }
      return created;
    });

    await audit(ctx.db, {
      action: invitation ? 'invitation.accepted' : 'auth.register',
      orgId: invitation?.org_id ?? null,
      actorUserId: user.id,
      ipHmac: ipKey(request),
    });

    if (!canSignIn) {
      const token = await issueToken(ctx, user.id, 'verify_email');
      await ctx.mailer.send(user.email, locale, {
        kind: 'verify-email',
        url: appLink(ctx, '/verify-email', token),
      });
      return reply.status(202).send({ status: 'verification_required' });
    }
    return reply.status(201).send({ status: 'registered' });
  });

  // ------------------------------------------------------------ verify email
  app.post('/api/v1/auth/verify-email', async (request) => {
    await ctx.limiter.hit(LIMITS.tokenRedeemIp, ipKey(request));
    const { token } = parse(z.object({ token: tokenSchema }), request.body);
    const user = await consumeToken(ctx, token, 'verify_email');
    if (!user) throw new HttpError(400, 'INVALID_TOKEN', 'The link is invalid or has expired');
    await ctx.db
      .updateTable('users')
      .set({ email_verified_at: user.email_verified_at ?? new Date(), updated_at: new Date() })
      .where('id', '=', user.id)
      .execute();
    await audit(ctx.db, { action: 'auth.email_verified', actorUserId: user.id });
    return { status: 'verified' };
  });

  app.post('/api/v1/auth/verify-email/resend', async (request, reply) => {
    await ctx.limiter.hit(LIMITS.emailSendIp, ipKey(request));
    const { email } = parse(z.object({ email: emailSchema }), request.body);
    await ctx.limiter.hit(LIMITS.emailSendAddress, sha256Hex(email));
    const user = await findActiveUserByEmail(ctx, email);
    if (user && !user.email_verified_at) {
      const token = await issueToken(ctx, user.id, 'verify_email');
      await ctx.mailer.send(user.email, asLocale(user.locale), {
        kind: 'verify-email',
        url: appLink(ctx, '/verify-email', token),
      });
    }
    return reply.status(202).send({ status: 'accepted' });
  });

  // ------------------------------------------------------------------ login
  app.post('/api/v1/auth/login', async (request, reply) => {
    await ctx.limiter.hit(LIMITS.loginIp, ipKey(request));
    const body = parse(z.object({ email: emailSchema, password: passwordSchema }), request.body);
    const emailKey = sha256Hex(body.email);
    await ctx.limiter.hit(LIMITS.loginEmail, emailKey);

    const user = await findActiveUserByEmail(ctx, body.email);
    const valid = user
      ? await verifyPassword(user.password_hash, body.password)
      : await verifyAgainstDummy(body.password);

    if (!user || !valid) {
      await audit(ctx.db, {
        action: 'auth.login.failure',
        actorUserId: user?.id ?? null,
        ipHmac: ipKey(request),
      });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    await ctx.limiter.reset(LIMITS.loginEmail, emailKey);

    if (verificationEnforced(ctx) && !user.email_verified_at) {
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your email address first');
    }

    if (user.mfa_enabled_at) {
      const mfaToken = await issueToken(ctx, user.id, 'mfa_challenge');
      return { mfaRequired: true as const, mfaToken };
    }
    return startSession(request, reply, user);
  });

  // ------------------------------------------------------------- mfa verify
  app.post('/api/v1/auth/mfa/verify', async (request, reply) => {
    const body = parse(
      z
        .object({
          mfaToken: tokenSchema,
          code: totpCodeSchema.optional(),
          recoveryCode: recoveryCodeSchema.optional(),
        })
        .refine((value) => (value.code === undefined) !== (value.recoveryCode === undefined), {
          message: 'Provide exactly one of code or recoveryCode',
          path: ['code'],
        }),
      request.body,
    );
    const challengeHash = sha256Hex(body.mfaToken);
    await ctx.limiter.hit(LIMITS.mfaChallenge, challengeHash);

    // Count the attempt atomically; a challenge allows at most 5 attempts.
    const challenge = await ctx.db
      .updateTable('user_tokens')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('token_hash', '=', challengeHash)
      .where('purpose', '=', 'mfa_challenge')
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date())
      .where('attempts', '<', 5)
      .returning('user_id')
      .executeTakeFirst();
    const invalid = new HttpError(
      401,
      'INVALID_TOKEN',
      'The verification session is invalid or expired',
    );
    if (!challenge) throw invalid;

    await ctx.limiter.hit(LIMITS.mfaUser, challenge.user_id);
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', challenge.user_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user?.mfa_enabled_at) throw invalid;

    const ok = body.code
      ? await verifyUserTotp(ctx, user, body.code)
      : await consumeRecoveryCode(ctx, user.id, body.recoveryCode ?? '');
    if (!ok) {
      await audit(ctx.db, {
        action: 'auth.mfa.failure',
        actorUserId: user.id,
        ipHmac: ipKey(request),
      });
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid verification code');
    }

    const consumed = await ctx.db
      .updateTable('user_tokens')
      .set({ used_at: new Date() })
      .where('token_hash', '=', challengeHash)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    if (consumed.numUpdatedRows === 0n) throw invalid;

    if (body.recoveryCode) {
      await audit(ctx.db, { action: 'auth.mfa.recovery_code_used', actorUserId: user.id });
    }
    return startSession(request, reply, user);
  });

  // -------------------------------------------------------------- providers
  /** Sign-in methods besides e-mail and password (shown on the sign-in page). */
  app.get('/api/v1/auth/providers', () => ({
    oidc: oidcEnabled(ctx.env) ? { name: ctx.env.OIDC_NAME } : null,
  }));

  // ------------------------------------------------------- session / logout
  app.get('/api/v1/auth/session', async (request) => {
    const { user } = requireAuth(request);
    return { user: publicUser(user), memberships: await listMemberships(ctx, user.id) };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.auth) {
      await ctx.db
        .deleteFrom('sessions')
        .where('id_hash', '=', request.auth.sessionIdHash)
        .execute();
      await audit(ctx.db, { action: 'auth.logout', actorUserId: request.auth.user.id });
    }
    clearSessionCookie(ctx.env, reply);
    return reply.status(204).send();
  });

  app.post('/api/v1/auth/logout-all', async (request, reply) => {
    const { user } = requireAuth(request);
    await revokeUserSessions(ctx, user.id);
    await audit(ctx.db, { action: 'auth.logout_all', actorUserId: user.id });
    clearSessionCookie(ctx.env, reply);
    return reply.status(204).send();
  });

  // --------------------------------------------------------------- password
  app.post('/api/v1/auth/password/forgot', async (request, reply) => {
    await ctx.limiter.hit(LIMITS.emailSendIp, ipKey(request));
    const { email } = parse(z.object({ email: emailSchema }), request.body);
    await ctx.limiter.hit(LIMITS.emailSendAddress, sha256Hex(email));
    const user = await findActiveUserByEmail(ctx, email);
    if (user) {
      const token = await issueToken(ctx, user.id, 'reset_password');
      await ctx.mailer.send(user.email, asLocale(user.locale), {
        kind: 'reset-password',
        url: appLink(ctx, '/reset-password', token),
      });
      await audit(ctx.db, {
        action: 'auth.password_reset_requested',
        actorUserId: user.id,
        ipHmac: ipKey(request),
      });
    }
    return reply.status(202).send({ status: 'accepted' });
  });

  app.post('/api/v1/auth/password/reset', async (request) => {
    await ctx.limiter.hit(LIMITS.tokenRedeemIp, ipKey(request));
    const body = parse(z.object({ token: tokenSchema, password: passwordSchema }), request.body);
    // Validate the new password against the token's account before consuming the token.
    const pending = await ctx.db
      .selectFrom('user_tokens')
      .innerJoin('users', 'users.id', 'user_tokens.user_id')
      .select('users.email')
      .where('user_tokens.token_hash', '=', sha256Hex(body.token))
      .where('user_tokens.purpose', '=', 'reset_password')
      .where('user_tokens.used_at', 'is', null)
      .where('user_tokens.expires_at', '>', new Date())
      .executeTakeFirst();
    if (pending) assertPasswordAcceptable(body.password, pending.email);

    const user = await consumeToken(ctx, body.token, 'reset_password');
    if (!user) throw new HttpError(400, 'INVALID_TOKEN', 'The link is invalid or has expired');

    await ctx.db
      .updateTable('users')
      .set({
        password_hash: await hashPassword(body.password),
        password_login: true,
        // Receiving the reset email proves ownership of the address.
        email_verified_at: user.email_verified_at ?? new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', user.id)
      .execute();
    await revokeUserSessions(ctx, user.id);
    await audit(ctx.db, {
      action: 'auth.password_reset',
      actorUserId: user.id,
      ipHmac: ipKey(request),
    });
    await sendSecurityNotice(ctx, user, 'password-changed');
    return { status: 'password_reset' };
  });

  app.post('/api/v1/auth/password/change', async (request) => {
    const { user, sessionIdHash } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.passwordChangeUser, user.id);
    const body = parse(
      z.object({ currentPassword: passwordSchema, newPassword: passwordSchema }),
      request.body,
    );
    if (!(await verifyPassword(user.password_hash, body.currentPassword))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    assertPasswordAcceptable(body.newPassword, user.email, 'newPassword');
    await ctx.db
      .updateTable('users')
      .set({ password_hash: await hashPassword(body.newPassword), updated_at: new Date() })
      .where('id', '=', user.id)
      .execute();
    await revokeUserSessions(ctx, user.id, sessionIdHash);
    await audit(ctx.db, { action: 'auth.password_changed', actorUserId: user.id });
    await sendSecurityNotice(ctx, user, 'password-changed');
    return { status: 'password_changed' };
  });

  // -------------------------------------------------------------------- MFA
  app.post('/api/v1/auth/mfa/totp/setup', async (request) => {
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.passwordChangeUser, user.id);
    const { password } = parse(z.object({ password: passwordSchema }), request.body);
    if (!(await verifyPassword(user.password_hash, password))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
    }
    if (user.mfa_enabled_at) {
      throw new HttpError(409, 'CONFLICT', 'Two-factor authentication is already enabled');
    }
    const secret = generateTotpSecret();
    await ctx.db
      .updateTable('users')
      .set({ mfa_pending_secret_enc: ctx.keys.encrypt(secret, mfaAad(user.id)) })
      .where('id', '=', user.id)
      .execute();
    return { secret, otpauthUri: totpUri({ secret, account: user.email, issuer: 'Rubinny' }) };
  });

  app.post('/api/v1/auth/mfa/totp/enable', async (request) => {
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.mfaUser, user.id);
    const { code } = parse(z.object({ code: totpCodeSchema }), request.body);
    if (user.mfa_enabled_at || !user.mfa_pending_secret_enc) {
      throw new HttpError(409, 'CONFLICT', 'Start the setup first');
    }
    const secretB32 = ctx.keys.decrypt(user.mfa_pending_secret_enc, mfaAad(user.id));
    const step = verifyTotp(base32Decode(secretB32), code, Date.now());
    if (step === null) throw new HttpError(400, 'INVALID_CREDENTIALS', 'Invalid verification code');

    await ctx.db
      .updateTable('users')
      .set({
        mfa_secret_enc: user.mfa_pending_secret_enc,
        mfa_pending_secret_enc: null,
        mfa_enabled_at: new Date(),
        mfa_last_step: step,
        updated_at: new Date(),
      })
      .where('id', '=', user.id)
      .execute();
    const recoveryCodes = await regenerateRecoveryCodes(ctx, user.id);
    await audit(ctx.db, { action: 'auth.mfa.enabled', actorUserId: user.id });
    await sendSecurityNotice(ctx, user, 'mfa-enabled');
    return { recoveryCodes };
  });

  app.post('/api/v1/auth/mfa/totp/disable', async (request) => {
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.mfaUser, user.id);
    const body = parse(z.object({ password: passwordSchema, code: totpCodeSchema }), request.body);
    if (!user.mfa_enabled_at)
      throw new HttpError(409, 'CONFLICT', 'Two-factor authentication is not enabled');
    const passwordOk = await verifyPassword(user.password_hash, body.password);
    const codeOk = passwordOk && (await verifyUserTotp(ctx, user, body.code));
    if (!codeOk) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid password or code');

    await ctx.db
      .updateTable('users')
      .set({
        mfa_secret_enc: null,
        mfa_pending_secret_enc: null,
        mfa_enabled_at: null,
        mfa_last_step: null,
        updated_at: new Date(),
      })
      .where('id', '=', user.id)
      .execute();
    await ctx.db.deleteFrom('recovery_codes').where('user_id', '=', user.id).execute();
    await audit(ctx.db, { action: 'auth.mfa.disabled', actorUserId: user.id });
    await sendSecurityNotice(ctx, user, 'mfa-disabled');
    return { status: 'disabled' };
  });

  app.post('/api/v1/auth/mfa/recovery-codes', async (request) => {
    const { user } = requireAuth(request);
    await ctx.limiter.hit(LIMITS.mfaUser, user.id);
    const { code } = parse(z.object({ code: totpCodeSchema }), request.body);
    if (!user.mfa_enabled_at)
      throw new HttpError(409, 'CONFLICT', 'Two-factor authentication is not enabled');
    if (!(await verifyUserTotp(ctx, user, code))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid verification code');
    }
    const recoveryCodes = await regenerateRecoveryCodes(ctx, user.id);
    await audit(ctx.db, { action: 'auth.mfa.recovery_codes_regenerated', actorUserId: user.id });
    return { recoveryCodes };
  });
}
