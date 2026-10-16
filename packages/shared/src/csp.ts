import { z } from 'zod';

/**
 * For pages with a strict Content Security Policy (no 'unsafe-eval'): zod would otherwise
 * probe `new Function` once to decide whether to compile validators, and the blocked probe
 * is reported as a CSP violation. Call once at startup in browser apps.
 */
export function enableStrictCspValidation(): void {
  z.config({ jitless: true });
}
