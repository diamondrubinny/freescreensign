// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { FastifyInstance } from 'fastify';
import type {} from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { formatPairingCode, generatePairingCode, heartbeatSchema } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { randomToken, sha256Hex } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import type { ScreenEvent } from '../../lib/screen-events.js';
import { parse } from '../../lib/validation.js';
import { sendStoredFile } from '../../media/serve.js';
import { clientIp } from '../auth/sessions.js';
import { findScreenByToken, requireScreen } from './auth.js';
import { buildManifest } from './manifest.js';
import { widgetData } from '../widgets/data.js';
import { reportScreenBack } from '../ops/alerts.js';
import { recordUptime } from '../ops/uptime.js';
import { deviceCredential, verifiedCredentials } from '../../lib/rate-limit-key.js';
import { isOlderVersion, SERVER_VERSION } from '../../lib/version.js';

export const PAIRING_TTL_MS = 10 * 60 * 1000;
const WS_AUTH_TIMEOUT_MS = 5000;
const WS_PING_INTERVAL_MS = 30_000;

export function pairingAad(codeHash: string): string {
  return `pairing:${codeHash}`;
}

/** Hashes a normalized pairing code (e.g. "K7Q29M"). */
export function pairingCodeHash(normalized: string): string {
  return sha256Hex(`rubinny-pairing:${normalized}`);
}

export function playerRoutes(app: FastifyInstance, ctx: AppContext) {
  // ---------------------------------------------------------------- pairing
  app.post('/player/v1/pair/start', async () => {
    return { ...(await startPairing()) };
  });

  async function startPairing() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePairingCode();
      const pollToken = randomToken();
      const inserted = await ctx.db
        .insertInto('pairing_codes')
        .values({
          code_hash: pairingCodeHash(code),
          poll_token_hash: sha256Hex(pollToken),
          expires_at: new Date(Date.now() + PAIRING_TTL_MS),
        })
        .onConflict((oc) => oc.column('code_hash').doNothing())
        .returning('code_hash')
        .executeTakeFirst();
      if (inserted) {
        return { code: formatPairingCode(code), pollToken, expiresIn: PAIRING_TTL_MS / 1000 };
      }
    }
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Could not allocate a pairing code');
  }

  app.addHook('onRequest', async (request) => {
    // The matched route, not the raw URL: "?x" or a trailing slash must not skip the limit
    // (security review, finding C1).
    if (request.method === 'POST' && request.routeOptions.url === '/player/v1/pair/start') {
      await ctx.limiter.hit(LIMITS.pairStartIp, ctx.keys.hashIp(clientIp(request)));
    }
  });

  app.post('/player/v1/pair/status', async (request) => {
    const { pollToken } = parse(z.object({ pollToken: z.string().min(20).max(100) }), request.body);
    const hash = sha256Hex(pollToken);
    // Deliver the device token exactly once: the row is deleted atomically.
    const claimed = await ctx.db
      .deleteFrom('pairing_codes')
      .where('poll_token_hash', '=', hash)
      .where('screen_id', 'is not', null)
      .returning(['code_hash', 'device_token_enc', 'screen_id'])
      .executeTakeFirst();
    if (claimed?.device_token_enc && claimed.screen_id) {
      const deviceToken = ctx.keys.decrypt(claimed.device_token_enc, pairingAad(claimed.code_hash));
      verifiedCredentials.remember(deviceCredential(sha256Hex(deviceToken)));
      return { status: 'paired' as const, deviceToken, screenId: claimed.screen_id };
    }
    const pending = await ctx.db
      .selectFrom('pairing_codes')
      .select('expires_at')
      .where('poll_token_hash', '=', hash)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    if (!pending) throw new HttpError(404, 'NOT_FOUND', 'Pairing code expired');
    return { status: 'pending' as const };
  });

  // --------------------------------------------------------------- manifest
  app.get('/player/v1/manifest', async (request, reply) => {
    const screen = await requireScreen(ctx, request);
    const manifest = await buildManifest(ctx.db, screen, ctx.env);
    await ctx.db
      .updateTable('screens')
      .set({ last_seen_at: new Date() })
      .where('id', '=', screen.id)
      .execute();
    void reply.header('etag', `"${manifest.version}"`).header('cache-control', 'no-cache');
    if (request.headers['if-none-match'] === `"${manifest.version}"`)
      return reply.status(304).send();
    return manifest;
  });

  // ------------------------------------------------------------------ media
  app.get('/player/v1/media/:mediaId', async (request, reply) => {
    const screen = await requireScreen(ctx, request);
    const { mediaId } = parse(z.object({ mediaId: z.uuid() }), request.params);
    const storage = ctx.media?.storage;
    const row = await ctx.db
      .selectFrom('media')
      .selectAll()
      .where('id', '=', mediaId)
      .where('org_id', '=', screen.org_id)
      .where('status', '=', 'ready')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!storage || !row?.storage_key) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    return sendStoredFile(storage, request, reply, {
      key: row.storage_key,
      size: Number(row.size_bytes),
      contentType: row.mime,
      filename: row.id,
      etag: row.sha256,
      // Content is immutable per id+hash; players keep their own cache.
      cacheControl: 'private, max-age=86400',
    });
  });

  // ---------------------------------------------------------- widget data
  /**
   * Data-widget content (RSS, weather, table, calendar, a room's status, synagogue times) for a
   * widget of the screen's own organization.
   */
  app.get('/player/v1/widgets/:widgetId/data', async (request, reply) => {
    const screen = await requireScreen(ctx, request);
    const { widgetId } = parse(z.object({ widgetId: z.uuid() }), request.params);
    const widget = await ctx.db
      .selectFrom('widgets')
      .select(['org_id', 'type', 'config'])
      .where('id', '=', widgetId)
      .where('org_id', '=', screen.org_id)
      .executeTakeFirst();
    if (!widget) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
    void reply.header('cache-control', 'no-store');
    return widgetData(ctx, widget);
  });

  // -------------------------------------------------------------- heartbeat
  app.post('/player/v1/heartbeat', async (request) => {
    const screen = await requireScreen(ctx, request);
    const body = parse(heartbeatSchema, request.body);
    await ctx.db
      .updateTable('screens')
      .set({
        last_seen_at: new Date(),
        ...(body.manifestVersion !== undefined ? { manifest_version: body.manifestVersion } : {}),
        ...(body.playerVersion ? { player_version: body.playerVersion } : {}),
        ...(body.resolution ? { resolution: body.resolution } : {}),
        ...(body.clockOffsetMs !== undefined ? { clock_offset_ms: body.clockOffsetMs } : {}),
        ...(body.layoutId !== undefined ? { current_layout_id: body.layoutId } : {}),
        ...(body.nowPlaying !== undefined ? { now_playing: JSON.stringify(body.nowPlaying) } : {}),
        ...(body.platform !== undefined ? { platform: body.platform } : {}),
        ...(body.capabilities !== undefined
          ? { capabilities: [...new Set(body.capabilities)] }
          : {}),
      })
      .where('id', '=', screen.id)
      .execute();
    await recordUptime(ctx.db, screen.id);
    // A player older than the server (the server was upgraded while the page kept running)
    // is asked to reload, so it gets the matching player code: an old player may not know
    // newer widgets and design settings. At most every 10 minutes: the request is lost when the
    // socket is not connected yet (right after the upgrade), and a stale cache cannot loop.
    if (body.playerVersion && isOlderVersion(body.playerVersion, SERVER_VERSION)) {
      const key = `player-update:${screen.id}`;
      if (!(await ctx.cache.get(key))) {
        await ctx.cache.set(key, '1', 600);
        await ctx.events.publish(screen.id, { type: 'reload' });
      }
    }
    // Back after an offline alert: tell the admins (in the background, best effort).
    void reportScreenBack(
      { db: ctx.db, mailer: ctx.mailer, publicUrl: ctx.env.PUBLIC_URL },
      screen.id,
    ).catch((err: unknown) => {
      request.log.error({ err }, 'screen back notice failed');
    });
    return { serverTime: new Date().toISOString() };
  });

  // -------------------------------------------------------------- websocket
  const sockets = new Map<string, Set<WebSocket>>();

  ctx.events.onEvent((screenId: string, event: ScreenEvent) => {
    for (const socket of sockets.get(screenId) ?? []) {
      socket.send(JSON.stringify(event));
      if (event.type === 'revoked') socket.close(4401, 'revoked');
    }
  });

  const pingTimer = setInterval(() => {
    for (const set of sockets.values()) {
      for (const socket of set) {
        const alive = socket as WebSocket & { isAlive?: boolean };
        if (alive.isAlive === false) {
          socket.terminate();
          continue;
        }
        alive.isAlive = false;
        socket.ping();
      }
    }
  }, WS_PING_INTERVAL_MS);
  pingTimer.unref();
  app.addHook('onClose', () => {
    clearInterval(pingTimer);
  });

  app.get('/player/v1/ws', { websocket: true }, (socket: WebSocket) => {
    let screenId: string | null = null;
    const alive = socket as WebSocket & { isAlive?: boolean };
    alive.isAlive = true;
    socket.on('pong', () => {
      alive.isAlive = true;
    });

    // The token is sent in the first message (not the URL) so it never reaches logs.
    const authTimer = setTimeout(() => {
      socket.close(4401, 'authentication timeout');
    }, WS_AUTH_TIMEOUT_MS);

    socket.on('message', (raw: Buffer) => {
      if (screenId) return; // players only listen after authenticating
      void (async () => {
        let token = '';
        try {
          const message = JSON.parse(raw.toString('utf8')) as { type?: unknown; token?: unknown };
          if (message.type === 'auth' && typeof message.token === 'string') token = message.token;
        } catch {
          // fall through to rejection
        }
        const screen = token ? await findScreenByToken(ctx, token) : null;
        clearTimeout(authTimer);
        if (!screen) {
          socket.close(4401, 'unauthorized');
          return;
        }
        screenId = screen.id;
        const set = sockets.get(screen.id) ?? new Set<WebSocket>();
        set.add(socket);
        sockets.set(screen.id, set);
        await ctx.db
          .updateTable('screens')
          .set({ last_seen_at: new Date() })
          .where('id', '=', screen.id)
          .execute();
        socket.send(JSON.stringify({ type: 'hello', screenId: screen.id }));
      })().catch(() => {
        socket.close(1011, 'internal error');
      });
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (!screenId) return;
      const set = sockets.get(screenId);
      set?.delete(socket);
      if (set?.size === 0) sockets.delete(screenId);
    });
  });
}
