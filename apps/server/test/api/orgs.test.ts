// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  STRONG_PASSWORD,
  createHarness,
  enableMfa,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  tokenFromMail,
  type Harness,
} from '../support/harness.js';

describe.runIf(integrationEnabled)('organizations, roles and tenant isolation', () => {
  let h: Harness;
  let orgA: string;
  let orgB: string;
  let owner: Client;
  let outsider: Client;

  beforeEach(async () => {
    h = await createHarness();
    orgA = await insertOrg(h.db, await insertUser(h.db, 'owner@example.com'), 'Org A', false);
    orgB = await insertOrg(h.db, await insertUser(h.db, 'outsider@example.com'), 'Org B', false);
    owner = await login(h.app, 'owner@example.com');
    outsider = await login(h.app, 'outsider@example.com');
  });
  afterEach(() => h.close());

  async function invite(email: string, role: string, by = owner, org = orgA) {
    return by.post(`/api/v1/orgs/${org}/invitations`, { email, role });
  }

  async function addMember(
    email: string,
    role: string,
  ): Promise<{ client: Client; userId: string }> {
    const userId = await insertUser(h.db, email);
    expect((await invite(email, role)).statusCode).toBe(201);
    const client = await login(h.app, email);
    const accepted = await client.post('/api/v1/invitations/accept', {
      token: tokenFromMail(h.mailer, email),
    });
    expect(accepted.statusCode).toBe(200);
    return { client, userId };
  }

  it('hides other organizations entirely (IDOR/BOLA)', async () => {
    for (const [method, url, body] of [
      ['GET', `/api/v1/orgs/${orgA}`],
      ['PATCH', `/api/v1/orgs/${orgA}`, { name: 'pwned' }],
      ['GET', `/api/v1/orgs/${orgA}/members`],
      ['GET', `/api/v1/orgs/${orgA}/audit`],
      ['POST', `/api/v1/orgs/${orgA}/invitations`, { email: 'x@example.com', role: 'ADMIN' }],
      ['GET', `/api/v1/orgs/not-a-uuid`],
      ['GET', `/api/v1/orgs/00000000-0000-0000-0000-000000000000`],
    ] as const) {
      const res = await outsider.request(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const org = await h.db
      .selectFrom('organizations')
      .select('name')
      .where('id', '=', orgA)
      .executeTakeFirstOrThrow();
    expect(org.name).toBe('Org A');
    // Symmetric: each owner sees only their own organization.
    expect((await outsider.get(`/api/v1/orgs/${orgB}`)).statusCode).toBe(200);
    expect((await owner.get(`/api/v1/orgs/${orgB}`)).statusCode).toBe(404);
    const memberships = (await owner.get('/api/v1/auth/session')).json<{
      memberships: { orgId: string }[];
    }>();
    expect(memberships.memberships.map((m) => m.orgId)).toEqual([orgA]);
  });

  it('requires authentication', async () => {
    const anon = new Client(h.app);
    expect((await anon.get(`/api/v1/orgs/${orgA}`)).statusCode).toBe(401);
    expect((await anon.post('/api/v1/orgs', { name: 'x' })).statusCode).toBe(401);
  });

  it('enforces roles: viewers cannot administer', async () => {
    const { client: viewer } = await addMember('viewer@example.com', 'VIEWER');
    expect((await viewer.get(`/api/v1/orgs/${orgA}`)).statusCode).toBe(200);
    expect((await viewer.get(`/api/v1/orgs/${orgA}/members`)).statusCode).toBe(403);
    expect((await viewer.patch(`/api/v1/orgs/${orgA}`, { name: 'x' })).statusCode).toBe(403);
    expect((await invite('y@example.com', 'EDITOR', viewer)).statusCode).toBe(403);
  });

  it('admins cannot manage owners; only owners can', async () => {
    const { client: admin, userId: adminId } = await addMember('admin@example.com', 'ADMIN');
    expect((await invite('o2@example.com', 'OWNER', admin)).statusCode).toBe(403);
    const ownerRow = await h.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'owner@example.com')
      .executeTakeFirstOrThrow();
    expect(
      (await admin.patch(`/api/v1/orgs/${orgA}/members/${ownerRow.id}`, { role: 'VIEWER' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await admin.patch(`/api/v1/orgs/${orgA}/members/${adminId}`, { role: 'OWNER' })).statusCode,
    ).toBe(403);
    expect((await admin.patch(`/api/v1/orgs/${orgA}`, { requireAdminMfa: true })).statusCode).toBe(
      403,
    );
    expect(
      (await owner.patch(`/api/v1/orgs/${orgA}/members/${adminId}`, { role: 'EDITOR' })).statusCode,
    ).toBe(200);
  });

  it('always keeps at least one owner', async () => {
    const ownerRow = await h.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'owner@example.com')
      .executeTakeFirstOrThrow();
    expect(
      (await owner.patch(`/api/v1/orgs/${orgA}/members/${ownerRow.id}`, { role: 'ADMIN' }))
        .statusCode,
    ).toBe(409);
    expect((await owner.delete(`/api/v1/orgs/${orgA}/members/${ownerRow.id}`)).statusCode).toBe(
      409,
    );
  });

  it('lets members leave and admins remove members', async () => {
    const { client: editor, userId: editorId } = await addMember('editor@example.com', 'EDITOR');
    const { userId: viewerId } = await addMember('viewer@example.com', 'VIEWER');
    expect((await editor.delete(`/api/v1/orgs/${orgA}/members/${viewerId}`)).statusCode).toBe(403);
    expect((await editor.delete(`/api/v1/orgs/${orgA}/members/${editorId}`)).statusCode).toBe(204);
    expect((await editor.get(`/api/v1/orgs/${orgA}`)).statusCode).toBe(404);
    expect((await owner.delete(`/api/v1/orgs/${orgA}/members/${viewerId}`)).statusCode).toBe(204);
  });

  it('enforces the admin MFA policy when enabled', async () => {
    await h.db
      .updateTable('organizations')
      .set({ require_admin_mfa: true })
      .where('id', '=', orgA)
      .execute();
    const blocked = await owner.get(`/api/v1/orgs/${orgA}/members`);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ error: { code: 'MFA_SETUP_REQUIRED' } });
    // Non-admin reads still work.
    expect((await owner.get(`/api/v1/orgs/${orgA}`)).statusCode).toBe(200);
    await enableMfa(owner);
    expect((await owner.get(`/api/v1/orgs/${orgA}/members`)).statusCode).toBe(200);
  });

  it('invitation tokens only work for the invited address and only once', async () => {
    await insertUser(h.db, 'invitee@example.com');
    await invite('invitee@example.com', 'EDITOR');
    const token = tokenFromMail(h.mailer, 'invitee@example.com');
    expect(h.mailer.lastTo('invitee@example.com')?.text).toContain('/accept-invitation#token=');

    const wrongUser = await outsider.post('/api/v1/invitations/accept', { token });
    expect(wrongUser.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });

    const invitee = await login(h.app, 'invitee@example.com');
    expect((await invitee.post('/api/v1/invitations/accept', { token })).statusCode).toBe(200);
    expect((await invitee.post('/api/v1/invitations/accept', { token })).statusCode).toBe(400);
    expect((await invitee.get(`/api/v1/orgs/${orgA}`)).json()).toMatchObject({
      org: { role: 'EDITOR' },
    });
  });

  it('revoked and replaced invitations stop working', async () => {
    await insertUser(h.db, 'late@example.com');
    const created = await invite('late@example.com', 'VIEWER');
    const firstToken = tokenFromMail(h.mailer, 'late@example.com');
    await invite('late@example.com', 'EDITOR'); // replaces the first
    const late = await login(h.app, 'late@example.com');
    expect((await late.post('/api/v1/invitations/accept', { token: firstToken })).statusCode).toBe(
      400,
    );

    const secondToken = tokenFromMail(h.mailer, 'late@example.com');
    const list = await owner.get(`/api/v1/orgs/${orgA}/invitations`);
    const pending = list.json<{ invitations: { id: string }[] }>().invitations;
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).not.toBe(created.json<{ invitation: { id: string } }>().invitation.id);
    expect(
      (await owner.delete(`/api/v1/orgs/${orgA}/invitations/${pending[0]!.id}`)).statusCode,
    ).toBe(204);
    expect((await late.post('/api/v1/invitations/accept', { token: secondToken })).statusCode).toBe(
      400,
    );
  });

  it('registers new users through an invitation (invite-only mode)', async () => {
    await invite('fresh@example.com', 'EDITOR');
    const token = tokenFromMail(h.mailer, 'fresh@example.com');
    const client = new Client(h.app);
    const mismatch = await client.post('/api/v1/auth/register', {
      email: 'other@example.com',
      password: STRONG_PASSWORD,
      name: 'X',
      inviteToken: token,
    });
    expect(mismatch.statusCode).toBe(400);
    const res = await client.post('/api/v1/auth/register', {
      email: 'fresh@example.com',
      password: STRONG_PASSWORD,
      name: 'Fresh',
      inviteToken: token,
    });
    expect(res.statusCode).toBe(201);
    const fresh = await login(h.app, 'fresh@example.com');
    expect((await fresh.get(`/api/v1/orgs/${orgA}`)).json()).toMatchObject({
      org: { role: 'EDITOR' },
    });
  });

  it('returns the invite link to the admin when outgoing mail is disabled', async () => {
    await h.close();
    h = await createHarness({ MAIL_TRANSPORT: 'disabled' });
    // MemoryMailer always delivers; emulate a non-delivering mailer for this case.
    Object.defineProperty(h.mailer, 'delivers', { value: false });
    const ownerId = await insertUser(h.db, 'owner@example.com');
    const org = await insertOrg(h.db, ownerId, 'Org', false);
    const client = await login(h.app, 'owner@example.com');
    const res = await client.post(`/api/v1/orgs/${org}/invitations`, {
      email: 'x@example.com',
      role: 'VIEWER',
    });
    expect(res.json()).toMatchObject({
      inviteUrl: expect.stringContaining('/accept-invitation#token=') as string,
    });
  });

  it('lets invitees sign in when outgoing mail is disabled (no verification possible)', async () => {
    await h.close();
    h = await createHarness({ MAIL_TRANSPORT: 'disabled' });
    Object.defineProperty(h.mailer, 'delivers', { value: false });
    const org = await insertOrg(h.db, await insertUser(h.db, 'owner@example.com'), 'Org', false);
    const admin = await login(h.app, 'owner@example.com');
    const created = await admin.post(`/api/v1/orgs/${org}/invitations`, {
      email: 'teacher@example.com',
      role: 'EDITOR',
    });
    const url = created.json<{ inviteUrl: string }>().inviteUrl;
    const token = new URL(url).hash.replace('#token=', '');

    const reg = await new Client(h.app).post('/api/v1/auth/register', {
      email: 'teacher@example.com',
      password: STRONG_PASSWORD,
      name: 'Teacher',
      inviteToken: token,
    });
    expect(reg.statusCode).toBe(201);
    const teacher = await login(h.app, 'teacher@example.com');
    expect((await teacher.get(`/api/v1/orgs/${org}`)).json()).toMatchObject({
      org: { role: 'EDITOR' },
    });
    // The address is honestly recorded as unverified.
    const row = await h.db
      .selectFrom('users')
      .select('email_verified_at')
      .where('email', '=', 'teacher@example.com')
      .executeTakeFirstOrThrow();
    expect(row.email_verified_at).toBeNull();
  });

  it('creates organizations up to the quota', async () => {
    await h.close();
    h = await createHarness({ MAX_ORGS_PER_USER: '2' });
    await insertOrg(h.db, await insertUser(h.db, 'q@example.com'));
    const client = await login(h.app, 'q@example.com');
    expect((await client.post('/api/v1/orgs', { name: 'Second' })).statusCode).toBe(201);
    const third = await client.post('/api/v1/orgs', { name: 'Third' });
    expect(third.json()).toMatchObject({ error: { code: 'QUOTA_EXCEEDED' } });
  });

  it('records an audit trail visible to admins, with pagination', async () => {
    await owner.patch(`/api/v1/orgs/${orgA}`, { name: 'Renamed' });
    await invite('a1@example.com', 'VIEWER');
    await invite('a2@example.com', 'VIEWER');
    const page1 = await owner.get(`/api/v1/orgs/${orgA}/audit?limit=2`);
    const body = page1.json<{
      events: { action: string; id: string }[];
      nextCursor: string | null;
    }>();
    expect(body.events.map((e) => e.action)).toEqual(['invitation.created', 'invitation.created']);
    expect(body.nextCursor).not.toBeNull();
    const page2 = await owner.get(`/api/v1/orgs/${orgA}/audit?limit=2&before=${body.nextCursor}`);
    expect(page2.json<{ events: { action: string }[] }>().events[0]?.action).toBe('org.updated');
    expect(page2.body).not.toContain('ip_hmac');
  });
});
