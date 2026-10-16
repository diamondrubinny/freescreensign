import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import { hasRole } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { ApprovalRequestsTable, ApprovalSummary } from '../../db/schema.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { beginTenantTransaction, requestDryRun } from '../../lib/tenant.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { appLink } from '../auth/tokens.js';

/**
 * Content approval (docs/phases/11b-approvals.md). When an organization requires it, an
 * editor's change to what screens show runs as a dry run (every check, then rolled back) and
 * is stored; an admin's approval runs the same request again as that admin.
 */

const MAX_PENDING = 100;

/** Items whose changes wait for approval: their table and route parameter. */
const KINDS = {
  playlist: { table: 'playlists', param: 'playlistId' },
  widget: { table: 'widgets', param: 'widgetId' },
  layout: { table: 'layouts', param: 'layoutId' },
  schedule: { table: 'schedules', param: 'scheduleId' },
  screen: { table: 'screens', param: 'screenId' },
  media: { table: 'media', param: 'mediaId' },
} as const;

export type ApprovalKind = keyof typeof KINDS;

type ApprovalRow = Selectable<ApprovalRequestsTable>;

async function itemName(ctx: AppContext, kind: ApprovalKind, id: string | undefined) {
  if (!id || !z.uuid().safeParse(id).success) return null;
  const { table } = KINDS[kind];
  const row = await ctx.db.selectFrom(table).select('name').where('id', '=', id).executeTakeFirst();
  return row?.name ?? null;
}

/**
 * preHandler after orgGuard on routes whose changes affect screens. Admins and owners, and
 * organizations without the setting, pass through unchanged.
 */
export function approvalGate(ctx: AppContext, kind: ApprovalKind) {
  return async (request: FastifyRequest) => {
    const org = requireOrg(request);
    if (!org.requireApproval || hasRole(org.role, 'ADMIN')) return;
    const { user } = requireAuth(request);
    const { count } = await ctx.db
      .selectFrom('approval_requests')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('org_id', '=', org.id)
      .where('status', '=', 'pending')
      .executeTakeFirstOrThrow();
    if (Number(count) >= MAX_PENDING) {
      throw new HttpError(409, 'QUOTA_EXCEEDED', 'Too many changes are waiting for approval');
    }
    await beginTenantTransaction(ctx.db, ctx.rls === true, org.id, true);

    const id = (request.params as Record<string, string | undefined>)[KINDS[kind].param];
    const method = request.method as 'PUT' | 'PATCH' | 'DELETE';
    const summary: ApprovalSummary = {
      kind,
      name: null,
      action: method === 'DELETE' ? 'delete' : request.url.endsWith('/items') ? 'items' : 'update',
    };
    const path = request.url.split('?')[0] ?? request.url;
    const body = request.body ?? null;
    requestDryRun(async () => {
      // After the rollback: the item is unchanged, so its current name describes the request.
      summary.name = await itemName(ctx, kind, id);
      const row = await ctx.db
        .insertInto('approval_requests')
        .values({
          org_id: org.id,
          method,
          path,
          body: body === null ? null : JSON.stringify(body),
          summary: JSON.stringify(summary),
          requested_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(ctx.db, {
        action: 'approval.requested',
        orgId: org.id,
        actorUserId: user.id,
        targetType: 'approval',
        targetId: row.id,
        meta: { kind, action: summary.action },
      });
      void notifyAdmins(ctx, org, user.name, summary).catch(() => undefined);
      return { approval: approvalDto(row, user.name, null) };
    });
  };
}

async function notifyAdmins(
  ctx: AppContext,
  org: { id: string; name: string },
  requester: string,
  summary: ApprovalSummary,
) {
  const admins = await ctx.db
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .select(['users.email', 'users.locale'])
    .where('memberships.org_id', '=', org.id)
    .where('memberships.role', 'in', ['OWNER', 'ADMIN'])
    .where('users.deleted_at', 'is', null)
    .execute();
  for (const admin of admins) {
    await ctx.mailer.send(admin.email, admin.locale === 'en' ? 'en' : 'he', {
      kind: 'approval-requested',
      orgName: org.name,
      requester,
      item: summary.name ?? summary.kind,
      url: appLink(ctx, `/orgs/${org.id}/approvals`),
    });
  }
}

function approvalDto(row: ApprovalRow, requestedBy: string | null, decidedBy: string | null) {
  return {
    id: row.id,
    status: row.status,
    summary: row.summary,
    method: row.method,
    body: row.body,
    requestedBy,
    requestedById: row.requested_by,
    requestedAt: row.requested_at.toISOString(),
    decidedBy,
    decidedAt: row.decided_at?.toISOString() ?? null,
    note: row.note,
  };
}

export function approvalRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };
  const params = z.object({ orgId: z.uuid(), approvalId: z.uuid() });

  async function withNames(rows: ApprovalRow[]) {
    const ids = [
      ...new Set(rows.flatMap((row) => [row.requested_by, row.decided_by]).filter(Boolean)),
    ] as string[];
    const users =
      ids.length > 0
        ? await ctx.db.selectFrom('users').select(['id', 'name']).where('id', 'in', ids).execute()
        : [];
    const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return rows.map((row) => approvalDto(row, name(row.requested_by), name(row.decided_by)));
  }

  app.get('/api/v1/orgs/:orgId/approvals', viewer, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { status } = parse(
      z.object({ status: z.enum(['pending', 'decided']).default('pending') }),
      request.query,
    );
    let query = ctx.db
      .selectFrom('approval_requests')
      .selectAll()
      .where('org_id', '=', org.id)
      .orderBy('requested_at', 'desc')
      .limit(200);
    query =
      status === 'pending'
        ? query.where('status', '=', 'pending')
        : query.where('status', '!=', 'pending');
    // Editors and viewers see their own requests; admins see everyone's.
    if (!hasRole(org.role, 'ADMIN')) query = query.where('requested_by', '=', user.id);
    return { approvals: await withNames(await query.execute()) };
  });

  async function decide(
    request: FastifyRequest,
    status: 'approved' | 'rejected' | 'withdrawn',
    note: string | null,
  ) {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { approvalId } = parse(params, request.params);
    // Locks the row: a second decision at the same time waits, then finds it decided.
    let update = ctx.db
      .updateTable('approval_requests')
      .set({ status, decided_by: user.id, decided_at: sql<Date>`now()`, note })
      .where('id', '=', approvalId)
      .where('org_id', '=', org.id)
      .where('status', '=', 'pending');
    // Only the requester withdraws a request.
    if (status === 'withdrawn') update = update.where('requested_by', '=', user.id);
    const row = await update.returningAll().executeTakeFirst();
    if (!row) {
      const exists = await ctx.db
        .selectFrom('approval_requests')
        .select('status')
        .where('id', '=', approvalId)
        .where('org_id', '=', org.id)
        .executeTakeFirst();
      if (!exists || (status === 'withdrawn' && exists.status === 'pending')) {
        throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
      }
      throw new HttpError(409, 'CONFLICT', 'This request was already decided');
    }
    return { org, user, row };
  }

  app.post('/api/v1/orgs/:orgId/approvals/:approvalId/approve', admin, async (request) => {
    const { org, user, row } = await decide(request, 'approved', null);
    if (!row.path.startsWith(`/api/v1/orgs/${org.id}/`)) {
      throw new HttpError(409, 'CONFLICT', 'The request cannot be applied');
    }
    // The original request again, as this admin (admins are never held for approval).
    const applied = await app.inject({
      method: row.method,
      url: row.path,
      remoteAddress: request.ip,
      headers: {
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
        ...(request.headers.origin ? { origin: request.headers.origin } : {}),
        ...(row.body !== null ? { 'content-type': 'application/json' } : {}),
      },
      ...(row.body !== null ? { payload: JSON.stringify(row.body) } : {}),
    });
    if (applied.statusCode >= 400) {
      // The decision rolls back with this error: the request stays pending.
      const error = applied.json<{ error?: { code?: string } }>().error?.code ?? 'CONFLICT';
      throw new HttpError(409, 'CONFLICT', 'The change can no longer be applied', [
        { path: 'approval', reason: error.toLowerCase() },
      ]);
    }
    await audit(ctx.db, {
      action: 'approval.approved',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'approval',
      targetId: row.id,
    });
    return { approval: (await withNames([row]))[0] };
  });

  app.post('/api/v1/orgs/:orgId/approvals/:approvalId/reject', admin, async (request) => {
    const { note } = parse(
      z.object({ note: z.string().trim().max(500).optional() }),
      request.body ?? {},
    );
    const { org, user, row } = await decide(request, 'rejected', note || null);
    await audit(ctx.db, {
      action: 'approval.rejected',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'approval',
      targetId: row.id,
    });
    return { approval: (await withNames([row]))[0] };
  });

  app.post('/api/v1/orgs/:orgId/approvals/:approvalId/withdraw', viewer, async (request) => {
    const { org, user, row } = await decide(request, 'withdrawn', null);
    await audit(ctx.db, {
      action: 'approval.withdrawn',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'approval',
      targetId: row.id,
    });
    return { approval: (await withNames([row]))[0] };
  });
}
