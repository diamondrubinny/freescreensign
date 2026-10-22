// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql, type ControlledTransaction } from 'kysely';
import type { Db } from '../db/database.js';
import type { Database } from '../db/schema.js';

/**
 * Row-level security for organization requests (defense in depth, see migration 0011).
 *
 * Each request gets a store (AsyncLocalStorage). When orgGuard admits a request it opens a
 * transaction as the role rubinny_tenant with app.org_id set; from then on `ctx.db` (a proxy)
 * runs every query of that request in it, including queries in shared helpers. The
 * transaction commits before the response is sent (rolled back on an error response), and
 * side effects that others would act on at once (screen notifications, worker jobs) run only
 * after the commit, so nobody reads the database before the change is visible.
 */

export const TENANT_ROLE = 'rubinny_tenant';

type Trx = ControlledTransaction<Database>;

interface TenantStore {
  trx: Trx | null;
  afterCommit: (() => Promise<void>)[];
  /**
   * Set for a change that waits for approval: the request runs completely (all checks), is
   * then rolled back, and this records it; its result is the response (202).
   */
  dryRun: (() => Promise<object>) | null;
  /** The client went away and the transaction was rolled back: later queries must fail. */
  aborted?: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();
/** The same stores by request: abort hooks run outside the request's async context. */
const stores = new WeakMap<FastifyRequest, TenantStore>();

/** The tenant transaction of the current request, if any (for tests and diagnostics). */
export function currentTenantTransaction(): Trx | null {
  return storage.getStore()?.trx ?? null;
}

let savepoints = 0;

/** `db.transaction()` inside a request transaction becomes a savepoint (same atomicity). */
function nestedTransaction(trx: Trx) {
  const builder = {
    setIsolationLevel: () => builder,
    setAccessMode: () => builder,
    async execute<T>(callback: (trx: Trx) => Promise<T>): Promise<T> {
      const name = `rubinny_sp_${String(++savepoints)}`;
      const point = await trx.savepoint(name).execute();
      try {
        const result = await callback(point);
        await point.releaseSavepoint(name).execute();
        return result;
      } catch (error) {
        await point.rollbackToSavepoint(name).execute();
        throw error;
      }
    },
  };
  return builder;
}

/** `db` for the application: inside a tenant transaction it is that transaction. */
export function tenantAwareDb(base: Db): Db {
  return new Proxy(base, {
    get(target, prop) {
      const store = storage.getStore();
      // Never fall back to the unrestricted connection for a handler still running.
      if (store?.aborted) throw new Error('The request was aborted');
      const trx = store?.trx;
      if (trx && !trx.isCommitted && !trx.isRolledBack) {
        if (prop === 'transaction') return () => nestedTransaction(trx);
        const value: unknown = Reflect.get(trx, prop, trx);
        return typeof value === 'function' ? (value as () => unknown).bind(trx) : value;
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
    },
  });
}

/**
 * Runs `task` after the request's tenant transaction commits (dropped if it rolls back).
 * Outside a tenant transaction it runs at once.
 */
export async function afterCommit(task: () => Promise<void>): Promise<void> {
  const store = storage.getStore();
  if (store?.trx) {
    store.afterCommit.push(task);
    return;
  }
  await task();
}

/**
 * Makes the current request a dry run (see TenantStore.dryRun). Needs the request's
 * transaction, so call beginTenantTransaction (with force) first.
 */
export function requestDryRun(record: () => Promise<object>): void {
  const store = storage.getStore();
  if (!store?.trx) throw new Error('A dry run needs the request transaction');
  store.dryRun = record;
}

/** True when the database has the tenant role and this connection may use it. */
export async function tenantRoleAvailable(db: Db): Promise<boolean> {
  const result = await sql<{ ok: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = ${TENANT_ROLE} AND pg_has_role(current_user, oid, 'MEMBER')
    ) AS ok`.execute(db);
  return result.rows[0]?.ok === true;
}

/**
 * Called by orgGuard once membership is verified: a transaction as the tenant role. Without
 * RLS it is a no-op, unless `force` (a dry run needs a transaction to roll back).
 */
export async function beginTenantTransaction(
  base: Db,
  enabled: boolean,
  orgId: string,
  force = false,
): Promise<void> {
  const store = storage.getStore();
  if ((!enabled && !force) || !store || store.trx) return;
  const trx = await base.startTransaction().execute();
  try {
    if (enabled) {
      // One round trip: set_config('role', …, true) is SET LOCAL ROLE.
      await sql`SELECT set_config('role', ${TENANT_ROLE}, true), set_config('app.org_id', ${orgId}, true)`.execute(
        trx,
      );
    }
  } catch (error) {
    await trx.rollback().execute();
    throw error;
  }
  store.trx = trx;
}

async function finish(store: TenantStore, commit: boolean): Promise<void> {
  const trx = store.trx;
  if (!trx) return;
  store.trx = null;
  const tasks = store.afterCommit.splice(0);
  if (trx.isCommitted || trx.isRolledBack) return;
  if (!commit) {
    await trx.rollback().execute();
    return;
  }
  await trx.commit().execute();
  for (const task of tasks) await task();
}

/**
 * Hooks: a store per request; commit (or roll back) before the response is sent; roll back
 * if the request ends any other way (aborted, closed).
 */
export function registerTenantHooks(app: FastifyInstance): void {
  app.addHook('onRequest', (request, _reply, done) => {
    const store: TenantStore = { trx: null, afterCommit: [], dryRun: null };
    stores.set(request, store);
    storage.run(store, done);
  });
  app.addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply, payload) => {
    const store = storage.getStore();
    if (!store) return payload;
    const record = store.dryRun;
    if (record && reply.statusCode < 400) {
      // Everything was checked; nothing of it is kept. The change waits for approval.
      store.dryRun = null;
      await finish(store, false);
      const body = await record();
      void reply.code(202).header('content-type', 'application/json; charset=utf-8');
      return JSON.stringify(body);
    }
    await finish(store, reply.statusCode < 400);
    return payload;
  });
  // Fastify requires async onRequestAbort hooks to declare exactly one parameter.
  const cleanUp = async (request: FastifyRequest) => {
    const store = stores.get(request);
    if (store?.trx) await finish(store, false).catch(() => undefined);
  };
  app.addHook('onResponse', cleanUp);
  app.addHook('onRequestAbort', async (request: FastifyRequest) => {
    const store = stores.get(request);
    if (store?.trx) store.aborted = true;
    await cleanUp(request);
  });
}
