import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  STRONG_PASSWORD,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';
import { runMaintenance } from '../../src/lib/maintenance.js';

describe.runIf(integrationEnabled)('profile, sessions and privacy rights', () => {
  let h: Harness;
  let orgId: string;
  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'dana@example.com'), 'Solo', false);
  });
  afterEach(() => h.close());

  it('updates the profile', async () => {
    const client = await login(h.app, 'dana@example.com');
    const res = await client.patch('/api/v1/me', { name: 'דנה לוי', locale: 'en' });
    expect(res.json()).toMatchObject({ user: { name: 'דנה לוי', locale: 'en' } });
    expect((await client.patch('/api/v1/me', { email: 'x@example.com' })).statusCode).toBe(400);
  });

  it('lists and revokes sessions', async () => {
    const a = await login(h.app, 'dana@example.com');
    const b = await login(h.app, 'dana@example.com');
    const list = await a.get('/api/v1/me/sessions');
    const sessions = list.json<{ sessions: { id: string; current: boolean }[] }>().sessions;
    expect(sessions).toHaveLength(2);
    const other = sessions.find((s) => !s.current)!;
    expect((await a.delete(`/api/v1/me/sessions/${other.id}`)).statusCode).toBe(204);
    expect((await b.get('/api/v1/auth/session')).statusCode).toBe(401);
    expect((await a.delete('/api/v1/me/sessions/0000000000000000')).statusCode).toBe(404);
  });

  it('exports personal data', async () => {
    const client = await login(h.app, 'dana@example.com');
    const res = await client.get('/api/v1/me/export');
    expect(res.headers['content-disposition']).toContain('attachment');
    const data = res.json<{
      profile: { email: string };
      memberships: unknown[];
      activity: { action: string }[];
    }>();
    expect(data.profile.email).toBe('dana@example.com');
    expect(data.memberships).toHaveLength(1);
    expect(data.activity.map((a) => a.action)).toContain('auth.login.success');
    expect(res.body).not.toMatch(/password_hash|argon2|mfa_secret/);
  });

  it('deletes the account (anonymized) and its solo organizations', async () => {
    const client = await login(h.app, 'dana@example.com');
    expect((await client.delete('/api/v1/me', { password: 'wrong-password-x' })).statusCode).toBe(
      401,
    );
    expect((await client.delete('/api/v1/me', { password: STRONG_PASSWORD })).statusCode).toBe(204);

    const relogin = await new Client(h.app).post('/api/v1/auth/login', {
      email: 'dana@example.com',
      password: STRONG_PASSWORD,
    });
    expect(relogin.statusCode).toBe(401);
    const user = await h.db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
    expect(user.email).toMatch(/^deleted-.*@deleted\.invalid$/);
    expect(user.name).toBe('Deleted user');
    expect(user.deleted_at).not.toBeNull();
    const org = await h.db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(org.deleted_at).not.toBeNull();
    expect(await h.db.selectFrom('sessions').selectAll().execute()).toHaveLength(0);
  });

  it('refuses deletion while being the only owner of a shared organization', async () => {
    const memberId = await insertUser(h.db, 'member@example.com');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: memberId, role: 'EDITOR' })
      .execute();
    const client = await login(h.app, 'dana@example.com');
    const res = await client.delete('/api/v1/me', { password: STRONG_PASSWORD });
    expect(res.statusCode).toBe(409);
  });

  it('maintenance removes expired sessions and tokens', async () => {
    await login(h.app, 'dana@example.com');
    await h.db
      .updateTable('sessions')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    const result = await runMaintenance(h.db, 365);
    expect(result.sessions).toBe(1);
    expect(await h.db.selectFrom('sessions').selectAll().execute()).toHaveLength(0);
  });
});
