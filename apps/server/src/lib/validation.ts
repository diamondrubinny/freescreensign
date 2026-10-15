import type { z } from 'zod';
import { HttpError } from './http-error.js';

/** Parses untrusted input; throws a client-safe 400 listing only the invalid field paths. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const seen = new Set<string>();
  const fields = result.error.issues
    .map((issue) => ({ path: issue.path.join('.') || '(body)', reason: issue.code }))
    .filter((field) => !seen.has(field.path) && seen.add(field.path));
  throw new HttpError(
    400,
    'VALIDATION_FAILED',
    `Invalid fields: ${fields.map((field) => field.path).join(', ')}`,
    fields,
  );
}
