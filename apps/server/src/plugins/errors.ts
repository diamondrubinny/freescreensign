import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError, ApiErrorCode, ApiFieldError } from '@rubinny/shared';
import { HttpError } from '../lib/http-error.js';

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  fields?: ApiFieldError[],
) {
  const body: ApiError = {
    error: { code, message, requestId: request.id, ...(fields ? { fields } : {}) },
  };
  return reply.status(statusCode).send(body);
}

const CLIENT_ERROR_CODES: Partial<Record<number, ApiErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

/**
 * Global error and not-found handling.
 * Internal error details are logged server-side and never returned to clients.
 */
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      const retryAfter = (error as HttpError & { retryAfter?: number }).retryAfter;
      if (retryAfter !== undefined) void reply.header('retry-after', String(retryAfter));
      if (error.statusCode >= 500) request.log.warn({ code: error.code }, 'service error');
      return send(reply, request, error.statusCode, error.code, error.message, error.fields);
    }

    if ('validation' in error && Array.isArray(error.validation)) {
      return send(reply, request, 400, 'VALIDATION_FAILED', 'Request validation failed');
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      const code = CLIENT_ERROR_CODES[statusCode] ?? 'BAD_REQUEST';
      request.log.info({ err: { code: error.code, statusCode } }, 'client error');
      return send(reply, request, statusCode, code, 'The request could not be processed');
    }

    request.log.error({ err: error }, 'unhandled error');
    return send(reply, request, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  app.setNotFoundHandler(
    // Rate-limit 404s too, to slow down endpoint enumeration.
    { preHandler: app.rateLimit() },
    (request, reply) => send(reply, request, 404, 'NOT_FOUND', 'Resource not found'),
  );
}
