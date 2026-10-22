/**
 * Pictures of the starter kits by trade on a screen, in Hebrew and English:
 *   docs/screenshots/kits/<kit>-<locale>.webp   (1600×900, for the READMEs)
 *   apps/cms/public/kits/<kit>-<locale>.webp    (640×360, the kits page in the dashboard)
 * Rendered with the player's widget code in Chromium; animations are shown finished.
 * Usage: pnpm --filter @rubinny/showcase screens   (PLAYWRIGHT_CHROMIUM_PATH optional)
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import sharp from 'sharp';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const work = here('../.cache/');
const docs = here('../../../docs/screenshots/kits/');
const cms = here('../../cms/public/kits/');

/** Kit → the slide that shows it best (a zone's item index, see entry.ts). */
const PICTURES = {
  restaurant: 0,
  cafe: 0,
  cinema: 0,
  retail: 0,
  office: 0,
  hotel: 0,
  community: 0,
};

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(docs, { recursive: true });
mkdirSync(cms, { recursive: true });

execFileSync('pnpm', ['exec', 'tsx', here('kits.mts'), work], {
  cwd: here('..'),
  stdio: 'inherit',
});
await build({
  entryPoints: [here('entry.ts')],
  outfile: `${work}bundle.js`,
  bundle: true,
  format: 'iife',
  target: 'chrome69',
  loader: { '.woff2': 'file', '.woff': 'file' },
  // The fonts and libraries the player uses come from its own dependencies.
  nodePaths: [here('../../player/node_modules')],
  logLevel: 'warning',
});
copyFileSync(here('index.html'), `${work}index.html`);

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
for (const [kit, slide] of Object.entries(PICTURES)) {
  for (const locale of ['he', 'en']) {
    await page.goto(`file://${work}index.html?kit=${kit}-${locale}&slide=${String(slide)}`);
    await page.waitForFunction(() => window.rendered === true);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((img) => !img.getAttribute('src') || img.complete),
    );
    // As a few seconds into the slide: enter animations done, loops (and the ticker) held still.
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        const timing = animation.effect?.getComputedTiming();
        if (timing?.iterations === Infinity) {
          animation.currentTime =
            (Number(timing.delay) || 0) + (Number(timing.duration) || 1000) * 0.3;
          animation.pause();
        } else {
          animation.finish();
        }
      }
    });
    await page.waitForTimeout(200);
    const png = await page.screenshot();
    const name = `${kit}-${locale}.webp`;
    await sharp(png).resize(1600, 900).webp({ quality: 82 }).toFile(`${docs}${name}`);
    await sharp(png).resize(640, 360).webp({ quality: 80 }).toFile(`${cms}${name}`);
    process.stdout.write(`${name}\n`);
  }
}
await browser.close();
if (errors.length > 0) {
  process.stderr.write(`Page errors:\n${errors.join('\n')}\n`);
  process.exit(1);
}
