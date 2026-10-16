import type {} from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest, RouteOptions } from 'fastify';
import { z } from 'zod';
import { hasRole, type Role } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { HttpError } from '../../lib/http-error.js';
import { beginTenantTransaction } from '../../lib/tenant.js';
import { resolveSession, sessionCookieName, type AuthState } from './sessions.js';

export interface OrgAccess {
  id: string;
  name: string;
  role: Role;
  requireAdminMfa: boolean;
  /** E-mail admins when a screen stays offline for `offlineAlertMinutes`. */
  offlineAlerts: boolean;
  offlineAlertMinutes: number;
  /** Editors' changes to what screens show wait for an admin's approval. */
  requireApproval: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthState | null;
    org: OrgAccess | null;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Registers session resolution and CSRF protection for /api routes.
 *
 * CSRF: browsers always send Origin (or Sec-Fetch-Site) on cross-site unsafe
 * requests, so we reject unsafe requests whose origin is not PUBLIC_URL. Combined
 * with SameSite=Lax cookies this follows OWASP's recommended defence in depth.
 * Requests without either header (non-browser clients) cannot carry a victim's
 * ambient cookies cross-site and are allowed.
 */
export function registerAuth(app: FastifyInstance, ctx: AppContext) {
  const allowedOrigin = new URL(ctx.env.PUBLIC_URL).origin;
  const cookieName = sessionCookieName(ctx.env);

  app.decorateRequest('auth', null);
  app.decorateRequest('org', null);

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;

    if (UNSAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      const fetchSite = request.headers['sec-fetch-site'];
      const crossSite =
        origin !== undefined
          ? origin !== allowedOrigin
          : fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none';
      if (crossSite) {
        throw new HttpError(403, 'FORBIDDEN', 'Cross-site request rejected');
      }
    }

    const token = request.cookies[cookieName];
    if (token) request.auth = await resolveSession(ctx, token);
  });
}

export function requireAuth(request: FastifyRequest): AuthState {
  if (!request.auth) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  return request.auth;
}

const orgParams = z.object({ orgId: z.uuid() });

/**
 * preHandler factory: authenticates, loads the caller's membership in :orgId and
 * enforces the minimum role. Non-members get 404 so org ids cannot be probed.
 */
/** Marks the preHandlers made by orgGuard (see assertOrgRouteGuarded). */
const ORG_GUARD = Symbol('orgGuard');

export function orgGuard(
  ctx: AppContext,
  minRole: Role,
  options: {
    /**
     * false: no request transaction (row-level security) for routes that stream large
     * uploads, so they do not hold a database connection for minutes. Their queries keep
     * filtering by organization in code, and the cross-tenant tests cover them.
     */
    transaction?: boolean;
  } = {},
) {
  const guard = async (request: FastifyRequest) => {
    const { user } = requireAuth(request);
    const params = orgParams.safeParse(request.params);
    if (!params.success) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');

    const row = await ctx.db
      .selectFrom('memberships')
      .innerJoin('organizations', 'organizations.id', 'memberships.org_id')
      .select([
        'organizations.id',
        'organizations.name',
        'organizations.require_admin_mfa',
        'organizations.offline_alerts',
        'organizations.offline_alert_minutes',
        'organizations.require_approval',
        'memberships.role',
      ])
      .where('memberships.user_id', '=', user.id)
      .where('memberships.org_id', '=', params.data.orgId)
      .where('organizations.deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');

    if (!hasRole(row.role, minRole)) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action');
    }
    if (hasRole(minRole, 'ADMIN') && row.require_admin_mfa && !user.mfa_enabled_at) {
      throw new HttpError(
        403,
        'MFA_SETUP_REQUIRED',
        'Enable two-factor authentication to perform administrative actions',
      );
    }
    request.org = {
      id: row.id,
      name: row.name,
      role: row.role,
      requireAdminMfa: row.require_admin_mfa,
      offlineAlerts: row.offline_alerts,
      offlineAlertMinutes: row.offline_alert_minutes,
      requireApproval: row.require_approval,
    };
    if (options.transaction !== false) {
      await beginTenantTransaction(ctx.db, ctx.rls === true, row.id);
    }
  };
  return Object.assign(guard, { [ORG_GUARD]: minRole });
}

/**
 * Tenant isolation cannot be forgotten: registering a route under /api/v1/orgs/:orgId without
 * an orgGuard preHandler fails at startup (used as an onRoute hook).
 */
export function assertOrgRouteGuarded(route: RouteOptions): void {
  if (!route.url.startsWith('/api/v1/orgs/:orgId')) return;
  const preHandlers: unknown[] = [route.preHandler].flat();
  const guarded = preHandlers.some(
    (handler) => typeof handler === 'function' && ORG_GUARD in handler,
  );
  if (!guarded) {
    const methods = [route.method].flat().join(',');
    throw new Error(`Organization route without orgGuard: ${methods} ${route.url}`);
  }
}

export function requireOrg(request: FastifyRequest): OrgAccess {
  if (!request.org) throw new Error('orgGuard must run before requireOrg');
  return request.org;
}
