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
  const result = envSchema.safeParse(source);
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
