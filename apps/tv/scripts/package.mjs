// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Packages the built loader (dist/) for the TVs, into release/:
 * - Samsung: rubinny-tv-tizen-<version>-unsigned.wgt, a zip of the widget. Unsigned: a Samsung
 *   screen installs only packages signed with the operator's own certificate (docs/players.md).
 * - LG: the .ipk made by LG's ares-package (@webos-tools/cli), when it is installed (in CI);
 *   `--require-webos` fails without it.
 * The version comes from package.json.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

const root = new URL('../', import.meta.url);
const path = (relative) => new URL(relative, root).pathname;
const { version } = JSON.parse(readFileSync(path('package.json'), 'utf8'));
const release = path('release/');
const stage = (name) => path(`release/stage-${name}/`);

if (!readdirSync(path('dist')).includes('loader.js')) {
  throw new Error('Build the loader first (pnpm --filter @rubinny/tv build).');
}
rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });

// Samsung (Tizen): config.xml at the root of the zip.
cpSync(path('dist/'), stage('tizen'), { recursive: true });
cpSync(path('tizen/icon.png'), `${stage('tizen')}icon.png`);
writeFileSync(
  `${stage('tizen')}config.xml`,
  readFileSync(path('tizen/config.xml'), 'utf8').replace('@VERSION@', version),
);
const wgt = `${release}rubinny-tv-tizen-${version}-unsigned.wgt`;
execFileSync('zip', ['-X', '-q', '-r', wgt, '.'], { cwd: stage('tizen') });
process.stdout.write(`${wgt}\n`);

// LG (webOS): appinfo.json at the root of the app.
cpSync(path('dist/'), stage('webos'), { recursive: true });
for (const icon of ['icon.png', 'largeIcon.png']) {
  cpSync(path(`webos/${icon}`), `${stage('webos')}${icon}`);
}
const appinfo = JSON.parse(readFileSync(path('webos/appinfo.json'), 'utf8'));
writeFileSync(
  `${stage('webos')}appinfo.json`,
  `${JSON.stringify({ ...appinfo, version }, null, 2)}\n`,
);
try {
  execFileSync('ares-package', ['-o', release, stage('webos')], { stdio: 'inherit' });
  const ipk = `${release}rubinny-tv-webos-${version}.ipk`;
  renameSync(`${release}${appinfo.id}_${version}_all.ipk`, ipk);
  process.stdout.write(`${ipk}\n`);
} catch (error) {
  if (process.argv.includes('--require-webos')) throw error;
  process.stdout.write(
    'ares-package not found: no .ipk made (npm install -g @webos-tools/cli to make one).\n',
  );
}
