// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';

/**
 * Integrations (docs/phases/19-integrations-api-webhooks.md): what an organization's API
 * keys may do, and the events its webhooks can receive. Shared by the server and the
 * dashboard.
 */

export const API_KEY_SCOPES = ['screens:read', 'alerts:write', 'widgets:write'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const WEBHOOK_EVENTS = [
  'screen.offline',
  'screen.online',
  'alert.started',
  'alert.ended',
  'approval.requested',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const INTEGRATION_LIMITS = {
  maxKeysPerOrg: 20,
  maxWebhooksPerOrg: 10,
  /** Keys can expire up to two years ahead (or never). */
  maxKeyDays: 730,
  /** Deliveries are kept this long. */
  deliveryRetentionDays: 7,
} as const;

/** Every key starts with this, so secret scanners (and people) recognize a leaked one. */
export const API_KEY_PREFIX = 'rbk_';

const name = z.string().trim().min(1).max(80);

export const apiKeyInputSchema = z.object({
  name,
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1)
    .max(API_KEY_SCOPES.length)
    .transform((scopes) => [...new Set(scopes)]),
  /** Days until the key stops working; null or omitted: never. */
  expiresInDays: z.number().int().min(1).max(INTEGRATION_LIMITS.maxKeyDays).nullable().optional(),
});
export type ApiKeyInput = z.infer<typeof apiKeyInputSchema>;

export const webhookUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain }));

export const webhookInputSchema = z.object({
  name,
  url: webhookUrlSchema,
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1)
    .max(WEBHOOK_EVENTS.length)
    .transform((events) => [...new Set(events)]),
  enabled: z.boolean().default(true),
});
export type WebhookInput = z.infer<typeof webhookInputSchema>;

/** The body of every webhook delivery (also what "send a test" sends, as "ping"). */
export interface WebhookPayload<T extends WebhookEvent | 'ping' = WebhookEvent | 'ping'> {
  id: string;
  event: T;
  /** ISO 8601. */
  createdAt: string;
  organization: { id: string };
  data: Record<string, unknown>;
}
