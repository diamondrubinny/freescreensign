import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { HttpError } from '../../lib/http-error.js';
import { LIMITS } from '../../lib/limiter.js';
import { SafeFetchError, safeFetch } from '../../lib/safe-fetch.js';
import { parse } from '../../lib/validation.js';
import { ingestMedia } from '../../media/ingest.js';
import { orgGuard, requireAuth, requireOrg } from '../auth/guards.js';
import { mediaDto } from '../media/routes.js';
import {
  attributionOf,
  detailUrl,
  parseSearch,
  parseStockImage,
  searchUrl,
  thumbUrl,
} from './openverse.js';

const SEARCH_TTL_SECONDS = 60 * 60;
const THUMB_MAX_BYTES = 1024 * 1024;
const THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const unavailable = () =>
  new HttpError(502, 'UPSTREAM_FAILED', 'The image library could not be reached');
const idParams = z.object({ orgId: z.uuid(), imageId: z.uuid() });

export function stockRoutes(app: FastifyInstance, ctx: AppContext) {
  const editor = { preHandler: orgGuard(ctx, 'EDITOR') };
  const base = ctx.env.STOCK_API_URL;
  // The library is an external service chosen by the operator (it may be self-hosted),
  // but the image files it points to are arbitrary URLs: those stay SSRF-protected.
  const apiFetch = (url: string, accept: string, maxBytes = 1024 * 1024) =>
    safeFetch(url, {
      allowPrivate: ctx.env.WIDGET_FETCH_ALLOW_PRIVATE,
      accept,
      maxBytes,
      timeoutMs: 8000,
    });

  const enabled = () => {
    if (!ctx.env.STOCK_IMAGES_ENABLED) throw new HttpError(404, 'NOT_FOUND', 'Resource not found');
  };

  app.get('/api/v1/orgs/:orgId/stock/images', editor, async (request) => {
    enabled();
    const { user } = requireAuth(request);
    const query = parse(
      z.object({
        q: z.string().trim().min(1).max(100),
        page: z.coerce.number().int().min(1).max(20).default(1),
      }),
      request.query,
    );
    const key = `stock:search:${query.q.toLowerCase()}:${String(query.page)}`;
    const cached = await ctx.cache.get(key);
    if (cached) return JSON.parse(cached) as unknown;
    await ctx.limiter.hit(LIMITS.stockSearchUser, user.id);
    let body;
    try {
      const response = await apiFetch(searchUrl(base, query.q, query.page), 'application/json');
      body = parseSearch(JSON.parse(response.body.toString('utf8')));
    } catch {
      throw unavailable();
    }
    const result = { page: query.page, pageCount: body.pageCount, results: body.results };
    await ctx.cache.set(key, JSON.stringify(result), SEARCH_TTL_SECONDS);
    return result;
  });

  /** Thumbnails are proxied, so the CMS keeps a strict img-src 'self' policy. */
  app.get('/api/v1/orgs/:orgId/stock/images/:imageId/thumb', editor, async (request, reply) => {
    enabled();
    const { imageId } = parse(idParams, request.params);
    let body: Buffer;
    try {
      body = (await apiFetch(thumbUrl(base, imageId), 'image/*', THUMB_MAX_BYTES)).body;
    } catch {
      throw unavailable();
    }
    const type = await fileTypeFromBuffer(body);
    if (!type || !THUMB_TYPES.has(type.mime)) throw unavailable();
    return reply
      .header('content-type', type.mime)
      .header('cache-control', 'private, max-age=86400')
      .header('x-content-type-options', 'nosniff')
      .send(body);
  });

  /** Downloads a stock image into the media library through the normal scan pipeline. */
  app.post('/api/v1/orgs/:orgId/stock/images/:imageId/import', editor, async (request, reply) => {
    enabled();
    const org = requireOrg(request);
    const { user } = requireAuth(request);
    const { imageId } = parse(idParams, request.params);
    const media = ctx.media;
    if (!media) throw new HttpError(404, 'NOT_FOUND', 'Media storage is not configured');
    await ctx.limiter.hit(LIMITS.stockImportUser, user.id);

    let image;
    try {
      const detail = await apiFetch(detailUrl(base, imageId), 'application/json');
      image = parseStockImage(JSON.parse(detail.body.toString('utf8')));
    } catch {
      throw unavailable();
    }
    if (!image || image.id !== imageId) {
      throw new HttpError(404, 'NOT_FOUND', 'This image is not available');
    }

    let file: Buffer;
    try {
      file = (
        await safeFetch(image.url, {
          allowPrivate: ctx.env.WIDGET_FETCH_ALLOW_PRIVATE,
          accept: 'image/jpeg, image/png, image/webp',
          maxBytes: ctx.env.MEDIA_MAX_IMAGE_BYTES,
          timeoutMs: 30_000,
          maxRedirects: 5,
        })
      ).body;
    } catch (error) {
      if (error instanceof SafeFetchError && error.reason === 'too_large') {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'File is too large', [
          { path: 'file', reason: 'too_large' },
        ]);
      }
      throw unavailable();
    }

    const row = await ingestMedia(ctx, media, {
      orgId: org.id,
      userId: user.id,
      filename: `${image.id}.${image.filetype ?? 'jpg'}`,
      ...(image.title ? { name: image.title } : {}),
      stream: Readable.from([file]),
      kinds: ['image'],
      sourceUrl: image.foreign_landing_url ?? image.url,
      attribution: attributionOf(image),
    });
    return reply.status(202).send({ media: mediaDto(row, org.id) });
  });
}
