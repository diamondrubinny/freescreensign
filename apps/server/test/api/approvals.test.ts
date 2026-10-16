import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Approval {
  id: string;
  status: string;
  summary: { kind: string; name: string | null; action: string };
  requestedBy: string | null;
  note: string | null;
}

describe.runIf(integrationEnabled)('content approval', () => {
  let h: Harness;
  let orgId: string;
  let admin: Client;
  let editor: Client;
  let events: string[];

  const api = (path = '', org = orgId) => `/api/v1/orgs/${org}${path}`;

  beforeEach(async () => {
    h = await createHarness();
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    const editorId = await insertUser(h.db, 'teacher@school.example', { name: 'Noa' });
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    admin = await login(h.app, 'admin@school.example');
    editor = await login(h.app, 'teacher@school.example');
    events = [];
    h.events.onEvent((screenId, event) => {
      events.push(`${screenId}:${event.type}`);
    });
  });
  afterEach(() => h.close());

  /** A widget on a playlist shown by a paired screen. */
  async function content() {
    const widget = (
      await admin.post(api('/widgets'), {
        type: 'text',
        name: 'Notice',
        config: { text: 'Welcome' },
      })
    ).json<{ widget: { id: string } }>().widget;
    const playlist = (await admin.post(api('/playlists'), { name: 'Lobby' })).json<{
      playlist: { id: string };
    }>().playlist;
    await admin.put(api(`/playlists/${playlist.id}/items`), {
      items: [{ widgetId: widget.id, durationMs: 10_000 }],
    });
    const player = new Client(h.app, '203.0.113.40');
    const { code } = (await player.post('/player/v1/pair/start')).json<{ code: string }>();
    const screen = (
      await admin.post(api('/screens'), { code, name: 'Hall', playlistId: playlist.id })
    ).json<{ screen: { id: string } }>().screen;
    return { widget, playlist, screen };
  }

  const widgetText = async (id: string) =>
    (
      await h.db
        .selectFrom('widgets')
        .select('config')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).config.text;

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('changes go straight to screens until the organization requires approval', async () => {
    const { widget } = await content();
    const direct = await editor.patch(api(`/widgets/${widget.id}`), {
      config: { text: 'Direct' },
    });
    expect(direct.statusCode).toBe(200);
    expect(await widgetText(widget.id)).toBe('Direct');

    // Only admins change the setting.
    expect((await editor.patch(api(), { requireApproval: true })).statusCode).toBe(403);
    const on = await admin.patch(api(), { requireApproval: true });
    expect(on.json()).toMatchObject({ org: { requireApproval: true } });
  });

  it('holds an editor’s change after checking it, and applies it when an admin approves', async () => {
    const { widget, screen } = await content();
    await admin.patch(api(), { requireApproval: true });
    await settle();
    events.length = 0;

    // Invalid changes are refused at once and not stored.
    const invalid = await editor.patch(api(`/widgets/${widget.id}`), { config: { text: '' } });
    expect(invalid.statusCode).toBe(400);

    const held = await editor.patch(api(`/widgets/${widget.id}`), {
      config: { text: 'Exams start at 9' },
    });
    expect(held.statusCode, held.body).toBe(202);
    const { approval } = held.json<{ approval: Approval }>();
    expect(approval).toMatchObject({
      status: 'pending',
      requestedBy: 'Noa',
      summary: { kind: 'widget', name: 'Notice', action: 'update' },
    });
    // The dry run changed nothing and told no screen.
    await settle();
    expect(await widgetText(widget.id)).toBe('Welcome');
    expect(events).toEqual([]);
    // The admins were told by e-mail.
    expect(h.mailer.lastTo('admin@school.example')?.subject).toContain('Notice');

    // The editor sees her request; the admin approves it.
    const mine = (await editor.get(api('/approvals'))).json<{ approvals: Approval[] }>();
    expect(mine.approvals.map((a) => a.id)).toEqual([approval.id]);
    const approved = await admin.post(api(`/approvals/${approval.id}/approve`));
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({ approval: { status: 'approved' } });
    expect(await widgetText(widget.id)).toBe('Exams start at 9');
    await settle();
    expect(events).toContain(`${screen.id}:manifest.changed`);

    // Twice is refused.
    expect((await admin.post(api(`/approvals/${approval.id}/approve`))).statusCode).toBe(409);
    const actions = await h.db
      .selectFrom('audit_logs')
      .select('action')
      .where('action', 'like', 'approval.%')
      .execute();
    expect(actions.map((a) => a.action).sort()).toEqual([
      'approval.approved',
      'approval.requested',
    ]);
  });

  it('holds deletes and playlist content too; admins are never held', async () => {
    const { widget, playlist } = await content();
    await admin.patch(api(), { requireApproval: true });

    const deleting = await editor.delete(api(`/widgets/${widget.id}`));
    expect(deleting.statusCode).toBe(202);
    expect(deleting.json()).toMatchObject({
      approval: { summary: { kind: 'widget', action: 'delete' } },
    });
    expect(await h.db.selectFrom('widgets').select('id').execute()).toHaveLength(1);

    const items = await editor.put(api(`/playlists/${playlist.id}/items`), { items: [] });
    expect(items.json()).toMatchObject({ approval: { summary: { action: 'items' } } });

    // New content needs no approval (it is on no screen yet); nor do admins' changes.
    const created = await editor.post(api('/widgets'), {
      type: 'clock',
      name: 'Clock',
      config: {},
    });
    expect(created.statusCode).toBe(201);
    expect((await admin.patch(api(`/widgets/${widget.id}`), { name: 'Renamed' })).statusCode).toBe(
      200,
    );
    // Emergency alerts never wait.
    expect(
      (await editor.post(api('/alerts'), { style: 'emergency', title: 'Evacuate' })).statusCode,
    ).toBe(201);
  });

  it('rejects with a note, lets the requester withdraw, and keeps stale requests pending', async () => {
    const { widget } = await content();
    await admin.patch(api(), { requireApproval: true });
    const request = async (text: string) =>
      (await editor.patch(api(`/widgets/${widget.id}`), { config: { text } })).json<{
        approval: Approval;
      }>().approval;

    const first = await request('One');
    const rejected = await admin.post(api(`/approvals/${first.id}/reject`), {
      note: 'Please add the room',
    });
    expect(rejected.json()).toMatchObject({
      approval: { status: 'rejected', note: 'Please add the room' },
    });
    expect(await widgetText(widget.id)).toBe('Welcome');

    // Only the requester withdraws.
    const second = await request('Two');
    expect((await admin.post(api(`/approvals/${second.id}/withdraw`))).statusCode).toBe(404);
    expect((await editor.post(api(`/approvals/${second.id}/withdraw`))).json()).toMatchObject({
      approval: { status: 'withdrawn' },
    });

    // Editors cannot decide.
    const third = await request('Three');
    expect((await editor.post(api(`/approvals/${third.id}/approve`))).statusCode).toBe(403);

    // The widget is deleted meanwhile: approving fails and the request stays pending.
    await admin.delete(api(`/widgets/${widget.id}`));
    const stale = await admin.post(api(`/approvals/${third.id}/approve`));
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { code: 'CONFLICT', fields: [{ path: 'approval', reason: 'not_found' }] },
    });
    const pending = (await admin.get(api('/approvals'))).json<{ approvals: Approval[] }>();
    expect(pending.approvals.map((a) => a.id)).toEqual([third.id]);
    const decided = (await admin.get(api('/approvals?status=decided'))).json<{
      approvals: Approval[];
    }>();
    expect(decided.approvals.map((a) => a.status).sort()).toEqual(['rejected', 'withdrawn']);
  });

  it('also holds changes when row-level security is off (DATABASE_RLS=false)', async () => {
    await h.close();
    h = await createHarness({ DATABASE_RLS: 'false' });
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    const editorId = await insertUser(h.db, 'teacher@school.example');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    admin = await login(h.app, 'admin@school.example');
    editor = await login(h.app, 'teacher@school.example');
    const { widget } = await content();
    await admin.patch(api(), { requireApproval: true });
    const held = await editor.patch(api(`/widgets/${widget.id}`), { config: { text: 'x' } });
    expect(held.statusCode).toBe(202);
    expect(await widgetText(widget.id)).toBe('Welcome');
  });

  it('keeps organizations apart', async () => {
    const { widget } = await content();
    await admin.patch(api(), { requireApproval: true });
    const { approval } = (
      await editor.patch(api(`/widgets/${widget.id}`), { config: { text: 'x' } })
    ).json<{ approval: Approval }>();
    const otherOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'other@example.com'),
      'Other',
      false,
    );
    const other = await login(h.app, 'other@example.com');
    expect((await other.get(api('/approvals', otherOrg))).json()).toEqual({ approvals: [] });
    for (const org of [orgId, otherOrg]) {
      expect((await other.post(api(`/approvals/${approval.id}/approve`, org))).statusCode).toBe(
        404,
      );
    }
  });
});
