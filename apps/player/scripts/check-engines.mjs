// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Checks the built player against the oldest engine it supports, Chromium 69 (Samsung Tizen 5.5,
 * LG webOS Signage 6.0; docs/phases/14-tizen-webos.md): the JavaScript must parse as ES2019 and
 * must not call browser APIs that engine lacks. APIs the player guards or polyfills
 * (src/legacy.ts: globalThis, Object.fromEntries; crypto.randomUUID; Intl hourCycle) are not
 * listed. Runs after `vite build`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'acorn';

const dir = new URL('../dist/assets/', import.meta.url);

/** [name, pattern, Chromium version that added it]. */
const MISSING = [
  ['String.prototype.matchAll', /\.matchAll\(/, 73],
  ['String.prototype.replaceAll', /\.replaceAll\(/, 85],
  ['Promise.allSettled', /\.allSettled\(/, 76],
  ['Promise.any', /Promise\.any\(/, 85],
  ['Array/String .at()', /\.at\(-?\d/, 92],
  ['findLast', /\.findLast(Index)?\(/, 97],
  ['Array copy methods', /\.(toSorted|toReversed|toSpliced)\(/, 110],
  ['Object.hasOwn', /Object\.hasOwn\(/, 93],
  ['structuredClone', /\bstructuredClone\(/, 98],
  ['queueMicrotask', /\bqueueMicrotask\(/, 71],
  ['WeakRef', /\bnew WeakRef\(/, 84],
  ['AbortSignal.timeout', /AbortSignal\.timeout\(/, 103],
  ['Intl.RelativeTimeFormat', /Intl\.RelativeTimeFormat\b/, 71],
  ['Intl.ListFormat', /Intl\.ListFormat\b/, 72],
  ['Intl.Locale', /Intl\.Locale\b/, 74],
  ['Intl.DisplayNames', /Intl\.DisplayNames\b/, 81],
  ['Intl.Segmenter', /Intl\.Segmenter\b/, 87],
  ['dateStyle/timeStyle', /\b(dateStyle|timeStyle):/, 76],
  ['fractionalSecondDigits', /\bfractionalSecondDigits:/, 84],
];

const CSS_MISSING = [
  ['clamp()', /\bclamp\(/, 79],
  ['inset', /[;{]inset:/, 87],
];

const problems = [];
const files = readdirSync(dir);
for (const file of files) {
  const source = readFileSync(new URL(file, dir), 'utf8');
  if (file.endsWith('.js')) {
    try {
      parse(source, { ecmaVersion: 2019, sourceType: 'module' });
    } catch (error) {
      problems.push(`${file}: not ES2019 (${error.message})`);
    }
  }
  const rules = file.endsWith('.js') ? MISSING : file.endsWith('.css') ? CSS_MISSING : [];
  for (const [name, pattern, version] of rules) {
    const match = pattern.exec(source);
    if (match) {
      const at = source.slice(Math.max(0, match.index - 40), match.index + 40);
      problems.push(`${file}: ${name} needs Chromium ${version}: …${at}…`);
    }
  }
}

if (!files.some((file) => file.endsWith('.js'))) problems.push('no built JavaScript found');
if (problems.length > 0) {
  process.stderr.write(`The player does not run on Chromium 69:\n${problems.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`Player bundle checked for Chromium 69 (${String(files.length)} files).\n`);
