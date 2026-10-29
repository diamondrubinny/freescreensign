// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { ApiKeyScope, Role } from '@rubinny/shared';

/**
 * Who may call each route (docs/phases/21-security-review.md, S2). The server's routes are
 * compared with this table (test/security/authorization.test.ts): a route that is not listed,
 * an organization route whose guard asks for another role, or a listed route that no longer
 * exists fails the tests. Adding a route means deciding here who may call it.
 */
export type RoutePolicy =
  /** A member of the organization in :orgId with at least this role (orgGuard). */
  | { org: Role; check?: string }
  /** Any signed-in user. */
  | { session: string }
  /** A paired screen, with its device token. */
  | { device: string }
  /** An integration, with an API key that has this scope. */
  | { apiKey: ApiKeyScope }
  /** The installation's operator (with two-step verification). */
  | { operator: true }
  /** No authentication: why it is safe to call without one. */
  | { public: string };

/** Registered only when the feature is configured (the tests run without it). */
export const OPTIONAL_ROUTES = new Set([
  // Single sign-on (OIDC_* settings).
  'GET /api/v1/auth/oidc/start',
  'GET /api/v1/auth/oidc/callback',
  // Object storage (S3_* settings).
  'POST /api/v1/orgs/:orgId/media',
  'GET /api/v1/orgs/:orgId/media',
  'GET /api/v1/orgs/:orgId/media-usage',
  'GET /api/v1/orgs/:orgId/media/:mediaId',
  'GET /api/v1/orgs/:orgId/media/:mediaId/file',
  'GET /api/v1/orgs/:orgId/media/:mediaId/thumbnail',
  'PATCH /api/v1/orgs/:orgId/media/:mediaId',
  'DELETE /api/v1/orgs/:orgId/media/:mediaId',
  // The free image library (object storage too).
  'GET /api/v1/orgs/:orgId/stock/images',
  'GET /api/v1/orgs/:orgId/stock/images/:imageId/thumb',
  'POST /api/v1/orgs/:orgId/stock/images/:imageId/import',
]);

const OWN_BOOKING = 'members change their own bookings, admins anyone’s (assertMayEdit)';

export const ROUTE_POLICY: Record<string, RoutePolicy> = {
  // ---- Health and about ----------------------------------------------------------------
  'GET /health': { public: 'liveness for the orchestrator; answers "ok" only' },
  'GET /health/ready': {
    public: 'readiness for the orchestrator; names of dependencies and ok/fail only',
  },
  'GET /api/v1/about': { public: 'name, license and source (AGPL); no version or settings' },

  // ---- First run --------------------------------------------------------------------------
  'GET /api/v1/setup/status': { public: 'whether setup is needed; a boolean' },
  'POST /api/v1/setup': {
    public: 'needs the SETUP_TOKEN from the server, and only before the first account',
  },

  // ---- Accounts ---------------------------------------------------------------------------
  'POST /api/v1/auth/register': {
    public: 'self sign-up when allowed; rate limited, same answer for existing addresses',
  },
  'POST /api/v1/auth/verify-email': { public: 'needs the single-use token from the e-mail' },
  'POST /api/v1/auth/verify-email/resend': {
    public: 'rate limited; same answer whether or not the address exists',
  },
  'POST /api/v1/auth/login': { public: 'the sign-in itself; rate limited per address and IP' },
  'POST /api/v1/auth/mfa/verify': {
    public: 'needs the pending sign-in from the password step; rate limited',
  },
  'GET /api/v1/auth/providers': { public: 'whether SSO is available, for the sign-in page' },
  'GET /api/v1/auth/session': { session: 'the signed-in user and memberships (401 otherwise)' },
  'POST /api/v1/auth/logout': {
    public: 'ends the session in the cookie, if any; nothing to do without one',
  },
  'POST /api/v1/auth/logout-all': { session: 'ends all of the user’s sessions' },
  'POST /api/v1/auth/password/forgot': {
    public: 'rate limited; same answer whether or not the address exists',
  },
  'POST /api/v1/auth/password/reset': { public: 'needs the single-use token from the e-mail' },
  'POST /api/v1/auth/password/change': { session: 'needs the current password too' },
  'POST /api/v1/auth/mfa/totp/setup': { session: 'the user’s own two-step setup' },
  'POST /api/v1/auth/mfa/totp/enable': { session: 'the user’s own two-step setup' },
  'POST /api/v1/auth/mfa/totp/disable': { session: 'the user’s own; needs a code' },
  'POST /api/v1/auth/mfa/recovery-codes': { session: 'the user’s own; needs a code' },
  'GET /api/v1/auth/oidc/start': { public: 'starts SSO (state and PKCE in a short cookie)' },
  'GET /api/v1/auth/oidc/callback': {
    public: 'the identity provider’s redirect; checks state, nonce and PKCE',
  },
  'GET /api/v1/me': { session: 'the user’s own profile' },
  'PATCH /api/v1/me': { session: 'the user’s own profile' },
  'DELETE /api/v1/me': { session: 'deletes the user’s own account' },
  'GET /api/v1/me/export': { session: 'the user’s own data (right of access)' },
  'GET /api/v1/me/sessions': { session: 'the user’s own sessions' },
  'DELETE /api/v1/me/sessions/:sessionId': { session: 'only the user’s own sessions' },
  'GET /api/v1/me/identities': { session: 'the user’s own SSO identities' },
  'DELETE /api/v1/me/identities/:identityId': { session: 'only the user’s own identities' },
  'POST /api/v1/invitations/accept': { session: 'needs the single-use token from the e-mail' },
  'POST /api/v1/orgs': { session: 'creates an organization the user owns' },

  // ---- Operator ---------------------------------------------------------------------------
  'GET /api/v1/operator/status': { operator: true },

  // ---- Organization -----------------------------------------------------------------------
  'GET /api/v1/orgs/:orgId': { org: 'VIEWER' },
  'PATCH /api/v1/orgs/:orgId': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/members': { org: 'ADMIN' },
  'PATCH /api/v1/orgs/:orgId/members/:userId': {
    org: 'ADMIN',
    check: 'only owners manage owners; one owner always stays',
  },
  'DELETE /api/v1/orgs/:orgId/members/:userId': {
    org: 'VIEWER',
    check: 'members leave themselves; removing others runs the ADMIN guard (and its MFA rule)',
  },
  'GET /api/v1/orgs/:orgId/invitations': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/invitations': { org: 'ADMIN' },
  'DELETE /api/v1/orgs/:orgId/invitations/:invitationId': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/audit': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/ai': { org: 'VIEWER', check: 'never returns the key itself' },
  'PUT /api/v1/orgs/:orgId/ai': { org: 'ADMIN' },
  'DELETE /api/v1/orgs/:orgId/ai': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/ai/suggest': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/settings/sacred': { org: 'VIEWER' },
  'PUT /api/v1/orgs/:orgId/settings/sacred': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/sacred-times': { org: 'VIEWER' },
  'PUT /api/v1/orgs/:orgId/settings/room-pin': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/api-keys': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/api-keys': { org: 'ADMIN' },
  'DELETE /api/v1/orgs/:orgId/api-keys/:keyId': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/webhooks': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/webhooks': { org: 'ADMIN' },
  'PATCH /api/v1/orgs/:orgId/webhooks/:webhookId': { org: 'ADMIN' },
  'DELETE /api/v1/orgs/:orgId/webhooks/:webhookId': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/webhooks/:webhookId/secret': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/webhooks/:webhookId/test': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/webhooks/:webhookId/deliveries': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/approvals': {
    org: 'VIEWER',
    check: 'non-admins see only their own requests',
  },
  'POST /api/v1/orgs/:orgId/approvals/:approvalId/approve': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/approvals/:approvalId/reject': { org: 'ADMIN' },
  'POST /api/v1/orgs/:orgId/approvals/:approvalId/withdraw': {
    org: 'VIEWER',
    check: 'only the requester withdraws a request',
  },
  'GET /api/v1/orgs/:orgId/reports/plays': { org: 'VIEWER' },

  // ---- Screens ----------------------------------------------------------------------------
  'GET /api/v1/orgs/:orgId/screens': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/screens': { org: 'EDITOR' },
  'PATCH /api/v1/orgs/:orgId/screens/:screenId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/screens/:screenId': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/screens/:screenId/status': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/screens/:screenId/reload': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/screens/:screenId/screenshot': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/screens/:screenId/screenshot': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/screen-groups': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/screen-groups': { org: 'EDITOR' },
  'PATCH /api/v1/orgs/:orgId/screen-groups/:groupId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/screen-groups/:groupId': { org: 'EDITOR' },
  'PUT /api/v1/orgs/:orgId/screen-groups/:groupId/content': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/alerts': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/alerts': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/alerts/:alertId/end': { org: 'EDITOR' },

  // ---- Content ----------------------------------------------------------------------------
  'GET /api/v1/orgs/:orgId/playlists': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/playlists': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/playlists/:playlistId': { org: 'VIEWER' },
  'PATCH /api/v1/orgs/:orgId/playlists/:playlistId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/playlists/:playlistId': { org: 'EDITOR' },
  'PUT /api/v1/orgs/:orgId/playlists/:playlistId/items': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/playlists/:playlistId/duplicate': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/widget-types': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/widgets': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/widgets': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/widgets/:widgetId': { org: 'VIEWER' },
  'PATCH /api/v1/orgs/:orgId/widgets/:widgetId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/widgets/:widgetId': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/widgets/:widgetId/duplicate': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/widgets/:widgetId/data': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/layouts': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/layouts': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/layouts/:layoutId': { org: 'VIEWER' },
  'PATCH /api/v1/orgs/:orgId/layouts/:layoutId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/layouts/:layoutId': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/layouts/:layoutId/duplicate': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/starter-kits': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/starter-kits/:kitId': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/schedules': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/schedules': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/schedules/:scheduleId': { org: 'VIEWER' },
  'PATCH /api/v1/orgs/:orgId/schedules/:scheduleId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/schedules/:scheduleId': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/schedules/:scheduleId/duplicate': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/media': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/media': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/media-usage': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/media/:mediaId': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/media/:mediaId/file': { org: 'VIEWER' },
  'GET /api/v1/orgs/:orgId/media/:mediaId/thumbnail': { org: 'VIEWER' },
  'PATCH /api/v1/orgs/:orgId/media/:mediaId': { org: 'EDITOR' },
  'DELETE /api/v1/orgs/:orgId/media/:mediaId': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/stock/images': { org: 'EDITOR' },
  'GET /api/v1/orgs/:orgId/stock/images/:imageId/thumb': { org: 'EDITOR' },
  'POST /api/v1/orgs/:orgId/stock/images/:imageId/import': { org: 'EDITOR' },

  // ---- Meeting rooms ----------------------------------------------------------------------
  'GET /api/v1/orgs/:orgId/rooms': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/rooms': { org: 'ADMIN' },
  'PATCH /api/v1/orgs/:orgId/rooms/:roomId': { org: 'ADMIN' },
  'DELETE /api/v1/orgs/:orgId/rooms/:roomId': { org: 'ADMIN' },
  'GET /api/v1/orgs/:orgId/room-bookings': { org: 'VIEWER' },
  'POST /api/v1/orgs/:orgId/room-bookings': { org: 'VIEWER', check: 'any member books a room' },
  'PATCH /api/v1/orgs/:orgId/room-bookings/:bookingId': { org: 'VIEWER', check: OWN_BOOKING },
  'DELETE /api/v1/orgs/:orgId/room-bookings/:bookingId': { org: 'VIEWER', check: OWN_BOOKING },

  // ---- Screens (players) ------------------------------------------------------------------
  'POST /player/v1/pair/start': {
    public: 'a screen asks for a pairing code; rate limited per IP, codes expire in minutes',
  },
  'POST /player/v1/pair/status': {
    public: 'needs the secret poll token from pair/start; gives the device token once paired',
  },
  'GET /player/v1/manifest': { device: 'the screen’s own content' },
  'POST /player/v1/heartbeat': { device: 'the screen’s own status' },
  'GET /player/v1/ws': { device: 'live updates for the screen (token in the first message)' },
  'GET /player/v1/media/:mediaId': { device: 'only media in the screen’s own manifest' },
  'GET /player/v1/widgets/:widgetId/data': { device: 'only widgets the screen shows' },
  'POST /player/v1/plays': { device: 'proof of play for the screen’s own content' },
  'POST /player/v1/screenshot': { device: 'answers the dashboard’s request for this screen' },
  'POST /player/v1/rooms/:roomId/bookings': {
    device: 'only the screen’s own room widget; the organization’s PIN when set',
  },
  'POST /player/v1/rooms/:roomId/bookings/:bookingId/end': {
    device: 'only the screen’s own room widget; the organization’s PIN when set',
  },

  // ---- Integrations -----------------------------------------------------------------------
  'GET /api/integrations/v1/screens': { apiKey: 'screens:read' },
  'GET /api/integrations/v1/alerts': { apiKey: 'alerts:write' },
  'POST /api/integrations/v1/alerts': { apiKey: 'alerts:write' },
  'POST /api/integrations/v1/alerts/:alertId/end': { apiKey: 'alerts:write' },
  'PATCH /api/integrations/v1/widgets/:widgetId': { apiKey: 'widgets:write' },
};
