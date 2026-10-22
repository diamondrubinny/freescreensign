// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { AiError, createAnthropicAi, systemPrompt } from '../../src/lib/ai.js';

interface Seen {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

/** The official SDK against a fake API: records requests, answers with `respond`. */
function fakeApi(respond: (seen: Seen) => { status: number; body: unknown }) {
  const seen: Seen[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const request = {
      url: input instanceof Request ? input.url : input instanceof URL ? input.href : input,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    seen.push(request);
    const { status, body } = respond(request);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'retry-after-ms': '1' },
      }),
    );
  };
  return { seen, fetch };
}

const message = (text: string, stopReason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: text ? [{ type: 'text', text }] : [],
  stop_reason: stopReason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
});

const apiError = (type: string) => ({ type: 'error', error: { type, message: 'nope' } });

describe('AI client (official SDK)', () => {
  it('asks for a short answer at low effort, with the fixed instructions and fallbacks', async () => {
    const api = fakeApi(() => ({ status: 200, body: message('  ברוכים הבאים!  ') }));
    const ai = createAnthropicAi('sk-ant-test-key', {
      baseURL: 'http://ai.test',
      fetch: api.fetch,
    });
    const text = await ai.suggest({
      model: 'claude-opus-5-5',
      task: 'text',
      prompt: 'welcome sign',
      locale: 'he',
    });
    expect(text).toBe('ברוכים הבאים!');
    const [request] = api.seen;
    expect(request?.url).toContain('/v1/messages');
    expect(request?.headers.get('x-api-key')).toBe('sk-ant-test-key');
    expect(request?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(request?.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      system: systemPrompt('text', 'he'),
      messages: [{ role: 'user', content: 'welcome sign' }],
    });
    // The editor's text is only ever the user turn.
    expect(String(request?.body?.system)).not.toContain('welcome sign');
  });

  it('sends no fallbacks for Haiku and caps the answer length', async () => {
    const api = fakeApi(() => ({ status: 200, body: message('x'.repeat(1500)) }));
    const ai = createAnthropicAi('k', { baseURL: 'http://ai.test', fetch: api.fetch });
    const text = await ai.suggest({
      model: 'claude-haiku-5-5',
      task: 'translate',
      prompt: 'שלום',
      locale: 'he',
    });
    expect(text).toHaveLength(1000);
    expect(api.seen[0]?.body).not.toHaveProperty('fallbacks');
    expect(api.seen[0]?.headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');
    expect(String(api.seen[0]?.body?.system)).toContain('into English');
  });

  it('maps refusals, empty answers and provider errors to safe reasons', async () => {
    const cases: [{ status: number; body: unknown }, AiError['code']][] = [
      [{ status: 200, body: message('', 'refusal') }, 'refused'],
      [{ status: 200, body: message('') }, 'empty'],
      [{ status: 401, body: apiError('authentication_error') }, 'invalid_key'],
      [{ status: 403, body: apiError('permission_error') }, 'invalid_key'],
      [{ status: 404, body: apiError('not_found_error') }, 'model_unavailable'],
      [{ status: 429, body: apiError('rate_limit_error') }, 'rate_limited'],
      [{ status: 529, body: apiError('overloaded_error') }, 'unavailable'],
    ];
    for (const [response, code] of cases) {
      const api = fakeApi(() => response);
      const ai = createAnthropicAi('k', { baseURL: 'http://ai.test', fetch: api.fetch });
      const failure = await ai
        .suggest({ model: 'claude-opus-5-5', task: 'alert', prompt: 'p', locale: 'en' })
        .catch((error: unknown) => error);
      expect(failure, code).toBeInstanceOf(AiError);
      expect((failure as AiError).code).toBe(code);
    }
  });

  it('checks a key by reading the model, without generating anything', async () => {
    const api = fakeApi(({ url }) =>
      url.endsWith('/v1/models/claude-sonnet-5-5')
        ? {
            status: 200,
            body: { id: 'claude-sonnet-5-5', type: 'model', display_name: 'S', created_at: '' },
          }
        : { status: 401, body: apiError('authentication_error') },
    );
    const ai = createAnthropicAi('k', { baseURL: 'http://ai.test', fetch: api.fetch });
    await expect(ai.verify('claude-sonnet-5-5')).resolves.toBeUndefined();
    expect(api.seen.every((request) => request.method === 'GET')).toBe(true);
    await expect(ai.verify('claude-opus-5-5')).rejects.toMatchObject({ code: 'invalid_key' });
  });
});
