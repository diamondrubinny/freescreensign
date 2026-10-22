#!/usr/bin/env node
// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * The attribution header of every source file. `node scripts/headers.mjs` checks them (CI),
 * `node scripts/headers.mjs --fix` adds the missing ones. Keeping the attribution is a term of
 * the license (AGPL-3.0 section 7(b), see LICENSING.md).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const lines = (license) => [
  'Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.',
  'Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.',
  `SPDX-License-Identifier: ${license}`,
  'https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).',
];

/** The SDK packages are MIT; everything else is AGPL (LICENSING.md). */
const MIT = ['packages/shared/', 'packages/widget-sdk/'];
const licenseOf = (path) => (MIT.some((dir) => path.startsWith(dir)) ? 'MIT' : 'AGPL-3.0-only');

const STYLES = [
  [/\.(ts|tsx|mts|cts|js|mjs|cjs|java|kts)$/, (l) => l.map((x) => `// ${x}`).join('\n')],
  [/(\.sh|(^|\/)Dockerfile)$/, (l) => l.map((x) => `# ${x}`).join('\n')],
  [/\.css$/, (l) => `/*\n${l.map((x) => ` * ${x}`).join('\n')}\n */`],
  [/\.html$/, (l) => `<!--\n${l.map((x) => `  ${x}`).join('\n')}\n-->`],
];
const SKIP = /(^|\/)(node_modules|dist|release|\.cache)\//;

/** Lines that must stay first: a shebang, a Dockerfile parser directive, the HTML doctype. */
const KEEP_FIRST = /^(#!|# syntax=|<!doctype)/i;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => path && !SKIP.test(path) && STYLES.some(([re]) => re.test(path)));

const fix = process.argv.includes('--fix');
const missing = [];
for (const path of files) {
  const header = STYLES.find(([re]) => re.test(path))[1](lines(licenseOf(path)));
  const text = readFileSync(path, 'utf8');
  const first = text.split('\n', 1)[0];
  const keep = KEEP_FIRST.test(first) ? `${first}\n` : '';
  const rest = text.slice(keep.length);
  if (rest.startsWith(`${header}\n`)) continue;
  if (!fix) {
    missing.push(path);
    continue;
  }
  writeFileSync(path, `${keep}${header}\n${rest.startsWith('\n') ? '' : '\n'}${rest}`);
}

if (missing.length) {
  console.error(
    `${missing.length} file(s) without the Rubinny attribution header ` +
      `(run "node scripts/headers.mjs --fix"):\n${missing.map((p) => `  ${p}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(`Attribution header ${fix ? 'in place' : 'present'} in ${files.length} files.`);
