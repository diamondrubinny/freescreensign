/**
 * Builds the loader page into dist/: one classic script (not an ES module: TV apps run from
 * file://, where Chromium refuses module scripts), lowered for Chromium 69, plus the page and
 * its stylesheet. The script is checked to parse as ES2019.
 */
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { parse } from 'acorn';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
await build({
  entryPoints: [new URL('src/main.ts', root).pathname],
  outfile: new URL('loader.js', dist).pathname,
  bundle: true,
  format: 'iife',
  target: 'chrome69',
  minify: true,
  legalComments: 'none',
});
cpSync(new URL('static/', root), dist, { recursive: true });
// Fails the build if the script would not parse on Chromium 69.
parse(readFileSync(new URL('loader.js', dist), 'utf8'), {
  ecmaVersion: 2019,
  sourceType: 'script',
});
process.stdout.write('Loader built in dist/.\n');
