#!/usr/bin/env node
// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Checks the built dashboard and player (run after `pnpm build`): every JS and CSS file starts
 * with the attribution comment, and every page names Rubinny as its generator. Keeping the
 * attribution is a term of the license (AGPL-3.0 section 7(b), see LICENSING.md).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BANNER =
  '/*! Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.';
const GENERATOR = '<meta name="generator" content="Rubinny — Powered by Rubinny · Open source" />';

const problems = [];
let checked = 0;
for (const app of ['apps/cms/dist', 'apps/player/dist']) {
  const html = readFileSync(join(app, 'index.html'), 'utf8');
  if (!html.includes(GENERATOR)) problems.push(`${app}/index.html: no generator meta tag`);
  for (const name of readdirSync(join(app, 'assets'))) {
    if (!/\.(js|css)$/.test(name)) continue;
    checked += 1;
    // Vite puts its own preload map line first in the entry chunk.
    const text = readFileSync(join(app, 'assets', name), 'utf8').replace(
      /^const __vite__mapDeps=[^\n]*\n/,
      '',
    );
    if (!text.startsWith(BANNER)) {
      problems.push(`${app}/assets/${name}: no attribution comment`);
    }
  }
}
if (problems.length) {
  console.error(`The built files lost the Rubinny attribution:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`Attribution present in ${checked} built files and both pages.`);
