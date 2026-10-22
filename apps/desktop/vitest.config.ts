// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { defineConfig } from 'vitest/config';

// Unit tests only; e2e/ launches Electron through Playwright (pnpm e2e).
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
