// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';

/**
 * For pages with a strict Content Security Policy (no 'unsafe-eval'): zod would otherwise
 * probe `new Function` once to decide whether to compile validators, and the blocked probe
 * is reported as a CSP violation. Call once at startup in browser apps.
 */
export function enableStrictCspValidation(): void {
  z.config({ jitless: true });
}
