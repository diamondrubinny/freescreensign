// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hasRole } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { AI_MODELS, AI_PROMPT_MAX, AI_TASKS, AiError, DEFAULT_AI_MODEL } from '../../lib/ai.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';

/**
 * Writing suggestions with the organization's own Anthropic key (BYO key, opt-in; see
 * docs/phases/12-touch-wall-ai.md). Admins set the key; editors ask for suggestions. The key
 * is never returned, and prompts and answers are never stored or logged.
 */

const keyAad = (orgId: string) => `ai-key:${orgId}`;

/** HTTP status and a safe reason for each failure. */
const FAILURES: Record<AiError['code'], number> = {
  invalid_key: 502,
  model_unavailable: 502,
  rate_limited: 503,
  unavailable: 503,
  refused: 422,
  empty: 502,
};

function aiFailure(error: AiError) {
  return new HttpError(FAILURES[error.code], 'UPSTREAM_FAILED', 'The suggestion failed', [
    { path: 'ai', reason: error.code },
  ]);
}

export function aiRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  // Calls to the provider take seconds: no request transaction held meanwhile.
  const editorNoTrx = { preHandler: orgGuard(ctx, 'EDITOR', { transaction: false }) };
  const adminNoTrx = { preHandler: orgGuard(ctx, 'ADMIN', { transaction: false }) };
  const admin = { preHandler: orgGuard(ctx, 'ADMIN') };

  async function settings(orgId: string) {
    return ctx.db
      .selectFrom('organizations')
      .select(['ai_key_enc', 'ai_key_hint', 'ai_model', 'ai_enabled_at'])
      .where('id', '=', orgId)
      .executeTakeFirstOrThrow();
  }

  app.get('/api/v1/orgs/:orgId/ai', viewer, async (request) => {
    const org = requireOrg(request);
    const row = await settings(org.id);
    const isAdmin = hasRole(org.role, 'ADMIN');
    return {
      ai: {
        enabled: row.ai_key_enc !== null,
        model: row.ai_model,
        models: AI_MODELS,
        // Only admins see which key is set (its last characters), never the key.
        ...(isAdmin ? { keyHint: row.ai_key_hint, enabledAt: row.ai_enabled_at } : {}),
      },
    };
  });

  /** Sets the model and, when given, a new key (checked with the provider first). */
  app.put('/api/v1/orgs/:orgId/ai', adminNoTrx, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(
      z.object({
        apiKey: z.string().trim().min(20).max(300).optional(),
        model: z.enum(AI_MODELS).default(DEFAULT_AI_MODEL),
      }),
      request.body,
    );
    const current = await settings(org.id);
    const apiKey =
      body.apiKey ??
      (current.ai_key_enc ? ctx.keys.decrypt(current.ai_key_enc, keyAad(org.id)) : null);
    if (!apiKey) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'An API key is required', [
        { path: 'apiKey', reason: 'required' },
      ]);
    }
    await ctx.limiter.hit(LIMITS.aiKeyOrg, org.id);
    try {
      await ctx.ai(apiKey).verify(body.model);
    } catch (error) {
      if (error instanceof AiError && error.code === 'invalid_key') {
        throw new HttpError(400, 'VALIDATION_FAILED', 'The API key was not accepted', [
          { path: 'apiKey', reason: 'invalid' },
        ]);
      }
      if (error instanceof AiError && error.code === 'model_unavailable') {
        throw new HttpError(400, 'VALIDATION_FAILED', 'This key cannot use the model', [
          { path: 'model', reason: 'unavailable' },
        ]);
      }
      throw error instanceof AiError ? aiFailure(error) : error;
    }
    await ctx.db
      .updateTable('organizations')
      .set({
        ai_model: body.model,
        ...(body.apiKey
          ? {
              ai_key_enc: ctx.keys.encrypt(body.apiKey, keyAad(org.id)),
              ai_key_hint: body.apiKey.slice(-4),
            }
          : {}),
        ai_enabled_at: current.ai_enabled_at ?? new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'ai.settings_updated',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: org.id,
      meta: { model: body.model, keyChanged: Boolean(body.apiKey) },
    });
    const row = await settings(org.id);
    return {
      ai: {
        enabled: true,
        model: row.ai_model,
        models: AI_MODELS,
        keyHint: row.ai_key_hint,
        enabledAt: row.ai_enabled_at,
      },
    };
  });

  /** Turns suggestions off and deletes the key. */
  app.delete('/api/v1/orgs/:orgId/ai', admin, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    await ctx.db
      .updateTable('organizations')
      .set({ ai_key_enc: null, ai_key_hint: null, ai_enabled_at: null, updated_at: new Date() })
      .where('id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      action: 'ai.disabled',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: org.id,
    });
    return reply.status(204).send();
  });

  app.post('/api/v1/orgs/:orgId/ai/suggest', editorNoTrx, async (request) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const body = parse(
      z.object({
        task: z.enum(AI_TASKS),
        prompt: z.string().trim().min(1).max(AI_PROMPT_MAX),
        locale: z.enum(['he', 'en']).default('he'),
      }),
      request.body,
    );
    const row = await settings(org.id);
    if (row.ai_key_enc === null) {
      throw new HttpError(409, 'CONFLICT', 'Writing suggestions are off', [
        { path: 'ai', reason: 'disabled' },
      ]);
    }
    await ctx.limiter.hit(LIMITS.aiSuggestUser, user.id);
    await ctx.limiter.hit(LIMITS.aiSuggestOrg, org.id);
    const apiKey = ctx.keys.decrypt(row.ai_key_enc, keyAad(org.id));
    let suggestion: string;
    try {
      suggestion = await ctx.ai(apiKey).suggest({
        model: row.ai_model,
        task: body.task,
        prompt: body.prompt,
        locale: body.locale,
      });
    } catch (error) {
      // Logged without the prompt or the key: only the reason.
      if (error instanceof AiError) {
        request.log.warn({ reason: error.code }, 'AI suggestion failed');
        throw aiFailure(error);
      }
      throw error;
    }
    await audit(ctx.db, {
      action: 'ai.suggested',
      orgId: org.id,
      actorUserId: user.id,
      meta: { task: body.task, model: row.ai_model },
    });
    return { suggestion };
  });
}
