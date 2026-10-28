// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { WebhookEvent, WebhookPayload } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { afterCommit } from '../../lib/tenant.js';

/**
 * Something happened that webhooks may want to hear about: one delivery per subscribed,
 * enabled webhook of the organization is queued (in the request's transaction, so a change
 * that is rolled back sends nothing), and the dispatcher is woken after the commit.
 * Payloads carry ids, screen names and kinds of things only (no people, no e-mails).
 */
export async function emitWebhookEvent(
  ctx: Pick<AppContext, 'db'>,
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<number> {
  const hooks = await ctx.db
    .selectFrom('webhooks')
    .select('id')
    .where('org_id', '=', orgId)
    .where('enabled', '=', true)
    .where(sql<boolean>`${event} = ANY(events)`)
    .execute();
  if (hooks.length === 0) return 0;
  const payload: WebhookPayload = {
    id: randomUUID(),
    event,
    createdAt: new Date().toISOString(),
    organization: { id: orgId },
    data,
  };
  await ctx.db
    .insertInto('webhook_deliveries')
    .values(
      hooks.map((hook) => ({
        org_id: orgId,
        webhook_id: hook.id,
        event,
        payload: JSON.stringify(payload),
      })),
    )
    .execute();
  await afterCommit(() => {
    wakeDispatcher();
    return Promise.resolve();
  });
  return hooks.length;
}

let wake: (() => void) | null = null;

/** The dispatcher (delivery.ts) registers itself here, to send soon instead of next tick. */
export function onWebhookWake(handler: (() => void) | null): void {
  wake = handler;
}

export function wakeDispatcher(): void {
  wake?.();
}
