import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as oidc from 'openid-client';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { AppContext } from '../../context.js';
import type { User } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { randomToken } from '../../lib/crypto.js';
import { LIMITS } from '../../lib/limiter.js';
import { hashPassword } from '../../lib/password.js';
import { parse } from '../../lib/validation.js';
import { acceptInvitation } from '../orgs/invitations.js';
import { clientIp, createSession } from './sessions.js';
import { issueToken } from './tokens.js';

/**
 * Sign-in through an OpenID Connect provider (docs/phases/11a-sso-oidc.md).
 *
 * Authorization Code flow with PKCE (S256), a one-time `state` kept in Valkey and bound to
 * the browser by a cookie, and a `nonce` checked in the ID token. openid-client verifies the
 * token (signature against the provider's keys, issuer, audience, expiry). Users are matched
 * by (issuer, subject), or once by a verified e-mail address; local MFA still applies.
 */

const STATE_TTL_SECONDS = 600;
const CALLBACK_PATH = '/api/v1/auth/oidc/callback';

export type SsoError =
  | 'unavailable'
  | 'expired'
  | 'cancelled'
  | 'failed'
  | 'unverified_email'
  | 'domain'
  | 'not_invited';

export function oidcEnabled(env: Env): boolean {
  return Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET);
}

// __Secure- (not __Host-): browsers reject __Host- cookies unless Path=/, and this one
// should reach the OIDC routes only.
function stateCookieName(env: Env): string {
  return env.PUBLIC_URL.startsWith('https://') ? '__Secure-rubinny_oidc' : 'rubinny_oidc';
}

/** Only paths inside the dashboard: never another site (no open redirect). */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  // eslint-disable-next-line no-control-regex -- control characters are never valid here
  if (/[\u0000-\u001f\u007f]/.test(value) || value.startsWith('/api/')) return '/';
  return value.slice(0, 500);
}

interface SavedState {
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface Claims {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export function oidcRoutes(app: FastifyInstance, ctx: AppContext) {
  if (!oidcEnabled(ctx.env)) return;
  const env = ctx.env;
  const issuer = env.OIDC_ISSUER ?? '';
  const redirectUri = new URL(CALLBACK_PATH, env.PUBLIC_URL).toString();
  const secure = env.PUBLIC_URL.startsWith('https://');
  const ipKey = (request: FastifyRequest) => ctx.keys.hashIp(clientIp(request));

  // Discovered once; retried on the next sign-in if the provider was unreachable.
  let configuration: Promise<oidc.Configuration> | null = null;
  const config = () => {
    configuration ??= oidc
      .discovery(new URL(issuer), env.OIDC_CLIENT_ID ?? '', env.OIDC_CLIENT_SECRET, undefined, {
        // An http issuer is refused in production (env.ts); allowed for development and tests.
        // The library marks this option deprecated on purpose, so that it stands out.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        execute: issuer.startsWith('http://') ? [oidc.allowInsecureRequests] : [],
        timeout: 10,
      })
      .catch((error: unknown) => {
        configuration = null;
        throw error;
      });
    return configuration;
  };

  const loginError = (reply: FastifyReply, code: SsoError) =>
    reply.redirect(new URL(`/login?sso=${code}`, env.PUBLIC_URL).toString(), 302);

  // ------------------------------------------------------------------ start
  app.get('/api/v1/auth/oidc/start', async (request, reply) => {
    await ctx.limiter.hit(LIMITS.oidcIp, ipKey(request));
    const { returnTo } = parse(
      z.object({ returnTo: z.string().max(500).optional() }),
      request.query,
    );
    let configured: oidc.Configuration;
    try {
      configured = await config();
    } catch (error) {
      request.log.warn({ err: error }, 'OIDC provider unavailable');
      return loginError(reply, 'unavailable');
    }
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const saved: SavedState = { nonce, verifier, returnTo: safeReturnTo(returnTo) };
    await ctx.cache.set(`oidc:${state}`, JSON.stringify(saved), STATE_TTL_SECONDS);
    // Binds the flow to this browser: a callback started elsewhere is refused (login CSRF).
    reply.setCookie(stateCookieName(env), state, {
      path: '/api/v1/auth/oidc',
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: STATE_TTL_SECONDS,
    });
    const url = oidc.buildAuthorizationUrl(configured, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    return reply.redirect(url.toString(), 302);
  });

  // --------------------------------------------------------------- callback
  app.get(CALLBACK_PATH, async (request, reply) => {
    await ctx.limiter.hit(LIMITS.oidcIp, ipKey(request));
    const query = request.query as Record<string, unknown>;
    const state = typeof query.state === 'string' ? query.state : '';
    const cookieState = request.cookies[stateCookieName(env)];
    reply.clearCookie(stateCookieName(env), { path: '/api/v1/auth/oidc', secure });
    const savedText = state && cookieState === state ? await ctx.cache.take(`oidc:${state}`) : null;
    if (!savedText) return loginError(reply, 'expired');
    const saved = JSON.parse(savedText) as SavedState;
    if (typeof query.error === 'string') return loginError(reply, 'cancelled');

    let claims: Claims;
    try {
      claims = await exchange(await config(), request, saved, state);
    } catch (error) {
      request.log.warn({ err: error }, 'OIDC sign-in failed');
      await audit(ctx.db, {
        action: 'auth.login.failure',
        ipHmac: ipKey(request),
        meta: { method: 'oidc' },
      });
      return loginError(reply, 'failed');
    }

    const outcome = await resolveUser(claims);
    if (typeof outcome === 'string') {
      await audit(ctx.db, {
        action: 'auth.login.failure',
        ipHmac: ipKey(request),
        meta: { method: 'oidc', reason: outcome },
      });
      return loginError(reply, outcome);
    }
    const { user, created } = outcome;
    if (created) {
      await audit(ctx.db, {
        action: created === 'invitation' ? 'invitation.accepted' : 'auth.register',
        actorUserId: user.id,
        ipHmac: ipKey(request),
        meta: { method: 'oidc' },
      });
    }

    if (user.mfa_enabled_at) {
      // The same second step as a password sign-in. The token travels in the URL fragment,
      // which browsers never send to servers or in Referer headers.
      const mfaToken = await issueToken(ctx, user.id, 'mfa_challenge');
      const target = new URL('/login', env.PUBLIC_URL);
      target.hash = `mfa=${mfaToken}&returnTo=${encodeURIComponent(saved.returnTo)}`;
      return reply.redirect(target.toString(), 302);
    }
    await createSession(ctx, request, reply, user.id);
    await audit(ctx.db, {
      action: 'auth.login.success',
      actorUserId: user.id,
      ipHmac: ipKey(request),
      meta: { method: 'oidc' },
    });
    return reply.redirect(new URL(saved.returnTo, env.PUBLIC_URL).toString(), 302);
  });

  async function exchange(
    configured: oidc.Configuration,
    request: FastifyRequest,
    saved: SavedState,
    state: string,
  ): Promise<Claims> {
    // The callback URL as the provider redirected to it (the path is the same behind Caddy).
    const currentUrl = new URL(request.url, env.PUBLIC_URL);
    const tokens = await oidc.authorizationCodeGrant(configured, currentUrl, {
      pkceCodeVerifier: saved.verifier,
      expectedState: state,
      expectedNonce: saved.nonce,
      idTokenExpected: true,
    });
    const idToken = tokens.claims();
    if (!idToken) throw new Error('No ID token');
    let email = typeof idToken.email === 'string' ? idToken.email : undefined;
    let verified = idToken.email_verified;
    let name = typeof idToken.name === 'string' ? idToken.name : undefined;
    if (!email) {
      // Some providers only return the address from the UserInfo endpoint.
      const info = await oidc.fetchUserInfo(configured, tokens.access_token, idToken.sub);
      email = info.email;
      verified = info.email_verified;
      name ??= info.name;
    }
    return {
      issuer: idToken.iss,
      subject: idToken.sub,
      email: (email ?? '').trim().toLowerCase(),
      emailVerified: verified === true,
      name: name?.trim().slice(0, 200) || null,
    };
  }

  /** Finds, links or creates the user; or the reason it may not sign in. */
  async function resolveUser(
    claims: Claims,
  ): Promise<{ user: User; created: false | 'invitation' | 'registration' } | SsoError> {
    const linked = await ctx.db
      .selectFrom('user_identities')
      .innerJoin('users', 'users.id', 'user_identities.user_id')
      .selectAll('users')
      .where('user_identities.issuer', '=', claims.issuer)
      .where('user_identities.subject', '=', claims.subject)
      .where('users.deleted_at', 'is', null)
      .executeTakeFirst();
    if (linked) {
      await ctx.db
        .updateTable('user_identities')
        .set({ last_used_at: new Date() })
        .where('issuer', '=', claims.issuer)
        .where('subject', '=', claims.subject)
        .execute();
      return { user: linked, created: false };
    }

    // Linking by e-mail is only safe when the provider vouches for the address.
    if (!claims.emailVerified || !z.email().safeParse(claims.email).success) {
      return 'unverified_email';
    }
    const domain = claims.email.split('@')[1] ?? '';
    if (env.OIDC_ALLOWED_DOMAINS.length > 0 && !env.OIDC_ALLOWED_DOMAINS.includes(domain)) {
      return 'domain';
    }

    const link = async (userId: string) => {
      await ctx.db
        .insertInto('user_identities')
        .values({
          user_id: userId,
          issuer: claims.issuer,
          subject: claims.subject,
          email: claims.email,
        })
        .onConflict((oc) => oc.columns(['issuer', 'subject']).doNothing())
        .execute();
    };

    const existing = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', claims.email)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (existing) {
      if (!existing.email_verified_at) {
        // Nobody proved this address before: whoever registered it may not own it. The
        // provider proves it now, so the owner takes the account over and every credential
        // set before (password, MFA, recovery codes, sessions) stops working.
        const reset = await ctx.db.transaction().execute(async (trx) => {
          await trx.deleteFrom('sessions').where('user_id', '=', existing.id).execute();
          await trx.deleteFrom('recovery_codes').where('user_id', '=', existing.id).execute();
          await trx.deleteFrom('user_tokens').where('user_id', '=', existing.id).execute();
          return trx
            .updateTable('users')
            .set({
              email_verified_at: new Date(),
              password_hash: await hashPassword(randomToken()),
              password_login: false,
              mfa_secret_enc: null,
              mfa_pending_secret_enc: null,
              mfa_enabled_at: null,
              mfa_last_step: null,
              updated_at: new Date(),
            })
            .where('id', '=', existing.id)
            .returningAll()
            .executeTakeFirstOrThrow();
        });
        await link(existing.id);
        return { user: reset, created: false };
      }
      await link(existing.id);
      return { user: existing, created: false };
    }

    if (env.REGISTRATION_MODE === 'closed') return 'not_invited';
    const invitation = await ctx.db
      .selectFrom('invitations')
      .innerJoin('organizations', 'organizations.id', 'invitations.org_id')
      .selectAll('invitations')
      .where('invitations.email', '=', claims.email)
      .where('invitations.accepted_at', 'is', null)
      .where('invitations.revoked_at', 'is', null)
      .where('invitations.expires_at', '>', new Date())
      .where('organizations.deleted_at', 'is', null)
      .orderBy('invitations.created_at', 'desc')
      .executeTakeFirst();
    if (!invitation && env.REGISTRATION_MODE !== 'open') return 'not_invited';

    // No usable password: the account signs in through the provider (or sets one by reset).
    const passwordHash = await hashPassword(randomToken());
    const name = claims.name ?? claims.email.split('@')[0] ?? claims.email;
    const user = await ctx.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('users')
        .values({
          email: claims.email,
          name,
          password_hash: passwordHash,
          password_login: false,
          locale: 'he',
          email_verified_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if (invitation) {
        if (!(await acceptInvitation(trx, invitation, created.id))) {
          throw new Error('Invitation used concurrently');
        }
      } else {
        const org = await trx
          .insertInto('organizations')
          .values({ name })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx
          .insertInto('memberships')
          .values({ org_id: org.id, user_id: created.id, role: 'OWNER' })
          .execute();
      }
      await trx
        .insertInto('user_identities')
        .values({
          user_id: created.id,
          issuer: claims.issuer,
          subject: claims.subject,
          email: claims.email,
        })
        .execute();
      return created;
    });
    return { user, created: invitation ? 'invitation' : 'registration' };
  }
}
