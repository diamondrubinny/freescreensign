import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@rubinny/shared';
import { PASSWORD_MAX_LENGTH } from '../../lib/password.js';

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase());

/** Length/strength is checked separately by checkPassword() to return a precise reason. */
export const passwordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);
export const nameSchema = z.string().trim().min(1).max(200);
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const tokenSchema = z.string().min(20).max(100);
export const totpCodeSchema = z.string().regex(/^\d{6}$/);
export const recoveryCodeSchema = z
  .string()
  .trim()
  .max(20)
  .transform((value) => value.replace(/[\s-]/g, '').toUpperCase());
