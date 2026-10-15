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
    MIGRATE_ON_START: booleanString.default(true),

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
