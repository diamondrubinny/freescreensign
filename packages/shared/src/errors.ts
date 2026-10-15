import { z } from 'zod';

/** Stable machine-readable error codes returned by the API. */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'INVALID_TOKEN',
  'EMAIL_NOT_VERIFIED',
  'MFA_SETUP_REQUIRED',
  'REGISTRATION_CLOSED',
  'QUOTA_EXCEEDED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  /** An external source (e.g. an RSS feed) could not be fetched or parsed. */
  'UPSTREAM_FAILED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Field-level validation problem, e.g. { path: 'password', reason: 'too_short' }. */
export const apiFieldErrorSchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    requestId: z.string().optional(),
    /** Present for VALIDATION_FAILED. */
    fields: z.array(apiFieldErrorSchema).optional(),
  }),
});

export type ApiFieldError = z.infer<typeof apiFieldErrorSchema>;

export type ApiError = z.infer<typeof apiErrorSchema>;
