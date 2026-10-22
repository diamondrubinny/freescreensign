// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';

const booleanString = z.stringbool({ truthy: ['true', '1', 'yes'], falsy: ['false', '0', 'no'] });

/**
 * TRUST_PROXY accepts: "false" (default), "true" (trust every hop — only safe
 * when the server is unreachable except through the proxy), or a
 * comma-separated list of IPs/CIDRs or proxy-addr presets
 * ("loopback", "linklocal", "uniquelocal"), e.g. "uniquelocal".
 * Hop counts are not supported: Fastify treats them as untrusted.
 */
const trustProxy = z
  .string()
  .default('false')
  .refine((value) => !/^\d+$/.test(value.trim()), 'hop counts are not supported')
  .transform((value): boolean | string[] => {
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false' || trimmed === '') return false;
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PUBLIC_URL: z.url({ protocol: /^https?$/ }),
    ALLOW_INSECURE_PUBLIC_URL: booleanString.default(false),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Connections per server process. Organization requests hold one while they run. */
    DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(200).default(20),
    /** Row-level security for organization requests (needs the role from migration 0011). */
    DATABASE_RLS: booleanString.default(true),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    TRUST_PROXY: trustProxy,
    BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(10 * 1024 * 1024)
      .default(1024 * 1024),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),

    /** 32 random bytes, base64 encoded. Used to derive encryption/HMAC keys (HKDF). */
    ENCRYPTION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64'),
    /** Required in production to claim a fresh installation via POST /api/v1/setup. */
    SETUP_TOKEN: z.string().min(16).optional(),
    REGISTRATION_MODE: z.enum(['open', 'invite', 'closed']).default('invite'),
    REQUIRE_EMAIL_VERIFICATION: booleanString.default(true),
    MAX_ORGS_PER_USER: z.coerce.number().int().min(1).default(10),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    SESSION_ABSOLUTE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),
    /** Proof-of-play history (what screens showed). */
    PLAY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    MIGRATE_ON_START: booleanString.default(true),

    // --- Object storage (S3-compatible). Media features are disabled when unset.
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: booleanString.default(true),
    S3_BUCKET_QUARANTINE: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
      .default('rubinny-quarantine'),
    S3_BUCKET_MEDIA: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
      .default('rubinny-media'),

    // --- Malware scanning (clamd over TCP).
    CLAMAV_HOST: z.string().min(1).default('clamav'),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),

    // --- Media limits.
    MEDIA_MAX_IMAGE_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .default(25 * 1024 * 1024),
    MEDIA_MAX_VIDEO_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .default(512 * 1024 * 1024),
    /** Total bytes per organization; 0 means unlimited. */
    MEDIA_ORG_QUOTA_BYTES: z.coerce.number().int().min(0).default(0),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),

    // --- Widgets.
    /**
     * Forecast endpoint compatible with the Open-Meteo API. Weather widgets are
     * disabled when unset: the free public Open-Meteo API is for non-commercial
     * use only, so operators must choose it (or a commercial/self-hosted one) explicitly.
     */
    WEATHER_API_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** API key for a commercial Open-Meteo plan (sent as the `apikey` query parameter). */
    WEATHER_API_KEY: z.string().min(1).optional(),
    /**
     * Free stock images (public-domain/CC0 only) from an Openverse-compatible API.
     * Searches and downloads go through the server; browsers never contact it.
     */
    STOCK_IMAGES_ENABLED: booleanString.default(true),
    STOCK_API_URL: z.url({ protocol: /^https?$/ }).default('https://api.openverse.org/v1'),
    /** Lets widget fetches reach private addresses. Tests only; refused in production. */
    WIDGET_FETCH_ALLOW_PRIVATE: booleanString.default(false),

    // --- Sign-in through an OpenID Connect provider (SSO). Disabled unless OIDC_ISSUER is set.
    OIDC_ISSUER: z.url({ protocol: /^https?$/ }).optional(),
    OIDC_CLIENT_ID: z.string().min(1).max(500).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).max(2000).optional(),
    /** Shown on the sign-in button, e.g. "Google" or "the school account". */
    OIDC_NAME: z.string().trim().min(1).max(60).default('SSO'),
    /** Comma-separated e-mail domains accepted from the provider. Empty: any domain. */
    OIDC_ALLOWED_DOMAINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((domain) => domain.trim().toLowerCase())
          .filter(Boolean),
      ),

    MAIL_TRANSPORT: z.enum(['smtp', 'console', 'disabled']).default('disabled'),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().min(3).optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      !env.ALLOW_INSECURE_PUBLIC_URL &&
      !env.PUBLIC_URL.startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_URL'],
        message: 'must use https:// in production (set ALLOW_INSECURE_PUBLIC_URL=true to override)',
      });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'must not be "console" in production (it would log secret links)',
      });
    }
    if (env.NODE_ENV === 'production' && !env.SETUP_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['SETUP_TOKEN'],
        message: 'is required in production (protects the first-run setup)',
      });
    }
    if (env.NODE_ENV === 'production' && env.WIDGET_FETCH_ALLOW_PRIVATE) {
      ctx.addIssue({
        code: 'custom',
        path: ['WIDGET_FETCH_ALLOW_PRIVATE'],
        message: 'must not be enabled in production (it disables SSRF protection)',
      });
    }
    if (env.OIDC_ISSUER && (!env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_CLIENT_ID'],
        message: 'and OIDC_CLIENT_SECRET are required when OIDC_ISSUER is set',
      });
    }
    if (env.NODE_ENV === 'production' && env.OIDC_ISSUER?.startsWith('http://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'must use https:// in production',
      });
    }
    if (env.MAIL_TRANSPORT === 'smtp' && (!env.SMTP_URL || !env.MAIL_FROM)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'and MAIL_FROM are required when MAIL_TRANSPORT=smtp',
      });
    }
    if (
      env.REGISTRATION_MODE === 'open' &&
      env.REQUIRE_EMAIL_VERIFICATION &&
      env.MAIL_TRANSPORT === 'disabled'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'must be enabled when REGISTRATION_MODE=open and email verification is required',
      });
    }
    if (env.S3_ENDPOINT && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'and S3_SECRET_ACCESS_KEY are required when S3_ENDPOINT is set',
      });
    }
    if (env.SESSION_ABSOLUTE_DAYS < env.SESSION_TTL_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_DAYS'],
        message: 'must be greater than or equal to SESSION_TTL_DAYS',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Parses and validates environment variables.
 * Error messages name the offending keys but never echo their values,
 * so secrets (e.g. passwords inside DATABASE_URL) are not leaked to logs.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty values as unset (Docker Compose passes `VAR=` as an empty string).
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const key = issue.path.join('.') || '(root)';
        const message =
          issue.code === 'invalid_type' && issue.input === undefined ? 'is required' : 'is invalid';
        return `${key} ${issue.code === 'custom' ? issue.message : message}`;
      }),
    );
  }
  return result.data;
}
