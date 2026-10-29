// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * An OpenAPI description of every route, from the access policy table, for the ZAP API scans
 * (docs/phases/21-security-review.md, S4). Path parameters are filled in: the organization
 * given, ids that do not exist (so a scan probes input handling, not real data).
 *
 * Usage: tsx test/security/openapi.ts <base URL> <organization id> > openapi.json
 */
import { randomUUID } from 'node:crypto';
import { ROUTE_POLICY } from './route-policy.js';

/** Routes a scan must not call: they would end its own session or are not plain HTTP. */
const SKIP = new Set([
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/logout-all',
  'DELETE /api/v1/me',
  'POST /api/v1/auth/mfa/totp/disable',
  'POST /api/v1/auth/password/change',
  'GET /player/v1/ws',
  'GET /api/v1/auth/oidc/start',
  'GET /api/v1/auth/oidc/callback',
]);

const [baseUrl, orgId] = process.argv.slice(2);
if (!baseUrl || !orgId) {
  throw new Error('Usage: tsx test/security/openapi.ts <base URL> <organization id>');
}

const paths: Record<string, Record<string, unknown>> = {};
for (const key of Object.keys(ROUTE_POLICY).sort()) {
  if (SKIP.has(key)) continue;
  const [method = 'GET', template = '/'] = key.split(' ');
  const path = template.replace(/:([A-Za-z]+)/g, (_, name: string) =>
    name === 'orgId' ? orgId : name === 'kitId' ? 'lobby' : randomUUID(),
  );
  const operation: Record<string, unknown> = { responses: { default: { description: 'any' } } };
  if (method !== 'GET' && method !== 'DELETE') {
    operation.requestBody = {
      content: {
        'application/json': {
          schema: { type: 'object', properties: { name: { type: 'string', example: 'scan' } } },
        },
      },
    };
  }
  (paths[path] ??= {})[method.toLowerCase()] = operation;
}

process.stdout.write(
  JSON.stringify(
    {
      openapi: '3.0.3',
      info: { title: 'Rubinny (security scan)', version: '1' },
      servers: [{ url: baseUrl }],
      paths,
    },
    null,
    2,
  ),
);
