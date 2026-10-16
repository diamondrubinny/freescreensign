import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import { SCREENSHOT_LIMITS } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import type { Db } from '../../db/database.js';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { requireScreen } from '../player/auth.js';

const screenParams = z.object({ orgId: z.uuid(), screenId: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Resource not found');
const DAY_MS = 24 * 60 * 60 * 1000;

/** JPEG or PNG, judged by the bytes (never by the declared type). */
function looksLikeImage(bytes: Buffer): boolean {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return jpeg || png;
}

/** Re-encodes an uploaded screenshot: bounded size, JPEG, no metadata. */
export async function normalizeScreenshot(
  bytes: Buffer,
): Promise<{ image: Buffer; width: number; height: number }> {
  if (!looksLikeImage(bytes)) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected a JPEG or PNG image');
  }
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .resize({
        width: SCREENSHOT_LIMITS.maxSize,
        height: SCREENSHOT_LIMITS.maxSize,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { image: data, width: info.width, height: info.height };
  } catch {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The image could not be read');
  }
}

/** Deletes screenshots older than the retention period. */
export async function pruneScreenshots(db: Db, now = new Date()): Promise<number> {
  const result = await db
    .deleteFrom('screen_screenshots')
    .where('taken_at', '<', new Date(now.getTime() - SCREENSHOT_LIMITS.retentionDays * DAY_MS))
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

export function screenshotRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };

  /** Asks a screen (with a native wrapper) for a screenshot. */
  app.post('/api/v1/orgs/:orgId/screens/:screenId/screenshot', editor, async (request, reply) => {
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { screenId } = parse(screenParams, request.params);
    const screen = await ctx.db
      .selectFrom('screens')
      .select(['id', 'capabilities'])
      .where('id', '=', screenId)
      .where('org_id', '=', org.id)
      .executeTakeFirst();
    if (!screen) throw notFound();
    if (!screen.capabilities.includes('screenshot')) {
      throw new HttpError(409, 'CONFLICT', 'This screen cannot take screenshots');
    }
    await ctx.limiter.hit(LIMITS.screenshotScreen, screenId);
    await ctx.limiter.hit(LIMITS.screenshotUser, user.id);
    const requestId = randomUUID();
    await ctx.db
      .updateTable('screens')
      .set({ screenshot_request_id: requestId, screenshot_requested_at: new Date() })
      .where('id', '=', screenId)
      .execute();
    await ctx.events.publish(screenId, { type: 'screenshot', requestId });
    await audit(ctx.db, {
      action: 'screen.screenshot_requested',
      orgId: org.id,
      actorUserId: user.id,
      targetType: 'screen',
      targetId: screenId,
    });
    return reply.status(202).send({ requestId });
  });

  /** The latest screenshot of a screen. */
  app.get('/api/v1/orgs/:orgId/screens/:screenId/screenshot', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const { screenId } = parse(screenParams, request.params);
    const row = await ctx.db
      .selectFrom('screen_screenshots')
      .innerJoin('screens', 'screens.id', 'screen_screenshots.screen_id')
      .select(['screen_screenshots.image', 'screen_screenshots.taken_at'])
      .where('screen_screenshots.screen_id', '=', screenId)
      .where('screens.org_id', '=', org.id)
      .executeTakeFirst();
    if (!row) throw notFound();
    return reply
      .header('content-type', 'image/jpeg')
      .header('cache-control', 'private, no-store')
      .header('last-modified', row.taken_at.toUTCString())
      .send(row.image);
  });

  // The upload takes the raw image as the body; the parser is scoped to this route.
  void app.register((scope, _options, done) => {
    scope.addContentTypeParser(
      ['image/jpeg', 'image/png'],
      { parseAs: 'buffer', bodyLimit: SCREENSHOT_LIMITS.maxBytes },
      (_request, body, done) => {
        done(null, body);
      },
    );

    /** A wrapper answers a screenshot request. */
    scope.post(
      '/player/v1/screenshot',
      { bodyLimit: SCREENSHOT_LIMITS.maxBytes },
      async (request, reply) => {
        const screen = await requireScreen(ctx, request);
        const { requestId } = parse(z.object({ requestId: z.uuid() }), request.query);
        const body = request.body;
        if (!Buffer.isBuffer(body)) {
          throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected a JPEG or PNG image');
        }
        const pending =
          screen.screenshot_request_id === requestId &&
          screen.screenshot_requested_at !== null &&
          Date.now() - screen.screenshot_requested_at.getTime() <= SCREENSHOT_LIMITS.requestTtlMs;
        if (!pending) throw new HttpError(409, 'CONFLICT', 'No such screenshot request');

        const { image, width, height } = await normalizeScreenshot(body);
        // Claim the request atomically: a request is answered once.
        const claimed = await ctx.db
          .updateTable('screens')
          .set({ screenshot_request_id: null, screenshot_requested_at: null })
          .where('id', '=', screen.id)
          .where('screenshot_request_id', '=', requestId)
          .returning('id')
          .executeTakeFirst();
        if (!claimed) throw new HttpError(409, 'CONFLICT', 'No such screenshot request');
        await ctx.db
          .insertInto('screen_screenshots')
          .values({ screen_id: screen.id, image, width, height, taken_at: new Date() })
          .onConflict((oc) =>
            oc.column('screen_id').doUpdateSet({ image, width, height, taken_at: new Date() }),
          )
          .execute();
        return reply.status(204).send();
      },
    );
    done();
  });
}
