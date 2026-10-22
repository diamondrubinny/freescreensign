// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiError, type AiClientFactory, type AiSuggestInput } from '../../src/lib/ai.js';
import {
  type Client,
  createHarness,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

const VALID_KEY = 'sk-ant-test-0123456789abcdefWXYZ';

describe.runIf(integrationEnabled)('writing suggestions with the organization’s own key', () => {
  let h: Harness;
  let orgId: string;
  let admin: Client;
  let editor: Client;
  const calls: { key: string; input?: AiSuggestInput; verify?: string }[] = [];
  const api = (path = '') => `/api/v1/orgs/${orgId}${path}`;

  // A fake provider: one key works; prompts containing "refuse" are declined.
  const fakeAi: AiClientFactory = (key) => ({
    verify: (model) => {
      calls.push({ key, verify: model });
      if (key !== VALID_KEY) return Promise.reject(new AiError('invalid_key'));
      return Promise.resolve();
    },
    suggest: (input) => {
      calls.push({ key, input });
      if (input.prompt.includes('refuse')) return Promise.reject(new AiError('refused'));
      return Promise.resolve(`[${input.task}/${input.locale}] ${input.prompt}`);
    },
  });

  beforeEach(async () => {
    calls.length = 0;
    h = await createHarness({}, { ai: fakeAi });
    orgId = await insertOrg(h.db, await insertUser(h.db, 'admin@school.example'), 'School', false);
    const editorId = await insertUser(h.db, 'teacher@school.example');
    await h.db
      .insertInto('memberships')
      .values({ org_id: orgId, user_id: editorId, role: 'EDITOR' })
      .execute();
    admin = await login(h.app, 'admin@school.example');
    editor = await login(h.app, 'teacher@school.example');
  });
  afterEach(() => h.close());

  it('is off until an admin saves a working key; the key is stored encrypted, never shown', async () => {
    expect((await editor.get(api('/ai'))).json()).toMatchObject({
      ai: { enabled: false, model: 'claude-opus-5-5' },
    });
    const off = await editor.post(api('/ai/suggest'), { task: 'text', prompt: 'hi' });
    expect(off.statusCode).toBe(409);
    expect(off.json()).toMatchObject({ error: { fields: [{ path: 'ai', reason: 'disabled' }] } });

    // Only admins manage it.
    expect((await editor.put(api('/ai'), { apiKey: VALID_KEY })).statusCode).toBe(403);
    expect((await admin.put(api('/ai'), {})).json()).toMatchObject({
      error: { fields: [{ path: 'apiKey', reason: 'required' }] },
    });
    const wrong = await admin.put(api('/ai'), { apiKey: 'sk-ant-wrong-key-000000000' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({
      error: { fields: [{ path: 'apiKey', reason: 'invalid' }] },
    });

    const saved = await admin.put(api('/ai'), { apiKey: VALID_KEY, model: 'claude-sonnet-5-5' });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      ai: { enabled: true, model: 'claude-sonnet-5-5', keyHint: 'WXYZ' },
    });
    expect(saved.body).not.toContain(VALID_KEY);
    const row = await h.db
      .selectFrom('organizations')
      .select(['ai_key_enc'])
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(row.ai_key_enc?.toString('latin1')).not.toContain(VALID_KEY);
    // Editors see that it is on, not which key.
    const forEditor = (await editor.get(api('/ai'))).json<{ ai: Record<string, unknown> }>();
    expect(forEditor.ai).toMatchObject({ enabled: true });
    expect(forEditor.ai).not.toHaveProperty('keyHint');

    // Changing only the model checks the stored key again.
    calls.length = 0;
    await admin.put(api('/ai'), { model: 'claude-haiku-5-5' });
    expect(calls).toEqual([{ key: VALID_KEY, verify: 'claude-haiku-5-5' }]);
  });

  it('suggests text for editors, never stores the prompt, and explains failures', async () => {
    await admin.put(api('/ai'), { apiKey: VALID_KEY });
    const res = await editor.post(api('/ai/suggest'), {
      task: 'alert',
      prompt: 'fire drill at 10',
      locale: 'en',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ suggestion: '[alert/en] fire drill at 10' });
    expect(calls.at(-1)).toMatchObject({ key: VALID_KEY, input: { model: 'claude-opus-5-5' } });

    const logs = await h.db
      .selectFrom('audit_logs')
      .select(['action', 'meta'])
      .where('action', '=', 'ai.suggested')
      .execute();
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain('fire drill');

    const refused = await editor.post(api('/ai/suggest'), {
      task: 'text',
      prompt: 'please refuse',
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      error: { fields: [{ path: 'ai', reason: 'refused' }] },
    });
    const tooLong = await editor.post(api('/ai/suggest'), {
      task: 'text',
      prompt: 'x'.repeat(2001),
    });
    expect(tooLong.statusCode).toBe(400);
    const badTask = await editor.post(api('/ai/suggest'), { task: 'code', prompt: 'x' });
    expect(badTask.statusCode).toBe(400);
  });

  it('limits suggestions per person, and turns off with the key deleted', async () => {
    await admin.put(api('/ai'), { apiKey: VALID_KEY });
    for (let i = 0; i < 20; i++) {
      expect(
        (await editor.post(api('/ai/suggest'), { task: 'text', prompt: `n${String(i)}` }))
          .statusCode,
      ).toBe(200);
    }
    expect(
      (await editor.post(api('/ai/suggest'), { task: 'text', prompt: 'one more' })).statusCode,
    ).toBe(429);

    expect((await editor.delete(api('/ai'))).statusCode).toBe(403);
    expect((await admin.delete(api('/ai'))).statusCode).toBe(204);
    const row = await h.db
      .selectFrom('organizations')
      .select(['ai_key_enc', 'ai_key_hint'])
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ ai_key_enc: null, ai_key_hint: null });
    expect((await admin.post(api('/ai/suggest'), { task: 'text', prompt: 'x' })).statusCode).toBe(
      409,
    );
  });

  it('keeps organizations apart', async () => {
    await admin.put(api('/ai'), { apiKey: VALID_KEY });
    const otherOrg = await insertOrg(
      h.db,
      await insertUser(h.db, 'other@example.com'),
      'Other',
      false,
    );
    const other = await login(h.app, 'other@example.com');
    expect((await other.post(api('/ai/suggest'), { task: 'text', prompt: 'x' })).statusCode).toBe(
      404,
    );
    expect((await other.get(`/api/v1/orgs/${otherOrg}/ai`)).json()).toMatchObject({
      ai: { enabled: false },
    });
  });
});
