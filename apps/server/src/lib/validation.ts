import type { z } from 'zod';
import { HttpError } from './http-error.js';

/** Parses untrusted input; throws a client-safe 400 listing only the invalid field paths. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(body)'))];
  throw new HttpError(400, 'VALIDATION_FAILED', `Invalid fields: ${fields.join(', ')}`);
}
