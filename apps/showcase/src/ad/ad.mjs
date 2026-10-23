// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * The 30-second video ad, in Hebrew and English, landscape (1920×1080) and vertical
 * (1080×1920), with original synthesized music:
 *   docs/video/rubinny-ad-<he|en>-<16x9|9x16>.mp4   and a poster .jpg for each
 * Every frame is rendered in Chromium at an exact time (ad.html's window.seek), piped to
 * ffmpeg, and muxed with music.mjs's track. Needs ffmpeg with libx264 on the PATH.
 * Usage: pnpm --filter @rubinny/showcase ad [he|en] [wide|tall]   (default: all four)
 * AD_STILLS=2,9.5,14  writes only those frames, as apps/showcase/.cache/ad/<name>-<t>.png.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { poweredBy } from '@rubinny/shared';
import { writeMusic } from './music.mjs';

const SECONDS = 30;
const FPS = 30;
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const work = here('../../.cache/ad/');
const shots = here('../../../../docs/screenshots/');
const out = here('../../../../docs/video/');

const [onlyLang, onlyFormat] = process.argv.slice(2);
const langs = onlyLang ? [onlyLang] : ['he', 'en'];
const formats = onlyFormat ? [onlyFormat] : ['wide', 'tall'];
const stills = process.env.AD_STILLS?.split(',').map(Number);

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

// The page, its fonts (the dashboard's Heebo) and pictures, side by side.
copyFileSync(here('ad.html'), join(work, 'ad.html'));
const heebo = join(
  dirname(createRequire(here('../../../cms/package.json')).resolve('@fontsource-variable/heebo')),
  'files',
);
copyFileSync(join(heebo, 'heebo-hebrew-wght-normal.woff2'), join(work, 'heebo-hebrew.woff2'));
copyFileSync(join(heebo, 'heebo-latin-wght-normal.woff2'), join(work, 'heebo-latin.woff2'));
for (const lang of ['he', 'en']) {
  const sfx = lang === 'en' ? '-en' : '';
  for (const kit of ['restaurant', 'cafe', 'cinema', 'retail']) {
    copyFileSync(join(shots, `kits/${kit}-${lang}.webp`), join(work, `kit-${kit}-${lang}.webp`));
  }
  for (const page of ['designer', 'menu-editor', 'schedule', 'dashboard', 'mobile']) {
    copyFileSync(join(shots, `cms-${page}${sfx}.png`), join(work, `cms-${page}${sfx}.png`));
  }
}

const music = join(work, 'music.wav');
writeMusic(music, SECONDS);

/** Runs ffmpeg; resolves when it exits cleanly. */
function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)),
    );
    if (input) input(child.stdin);
  });
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
);
try {
  for (const lang of langs) {
    for (const format of formats) {
      const tall = format === 'tall';
      const viewport = tall ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
      const name = `rubinny-ad-${lang}-${tall ? '9x16' : '16x9'}`;
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      await page.addInitScript((text) => {
        window.AD_POWERED_BY = text;
      }, poweredBy(lang));
      await page.goto(`file://${join(work, 'ad.html')}?lang=${lang}&format=${format}`);
      await page.evaluate(() => window.ready());
      if (stills) {
        for (const t of stills) {
          await page.evaluate((time) => window.seek(time), t);
          await page.screenshot({ path: join(work, `${name}-${t}.png`) });
        }
        await page.close();
        continue;
      }

      const video = join(out, `${name}.mp4`);
      const frames = SECONDS * FPS;
      let failure;
      const encoding = ffmpeg(
        [
          ...['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-'],
          ...['-i', music],
          ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p'],
          ...['-profile:v', 'high', '-tune', 'animation', '-r', String(FPS)],
          ...['-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart'],
          ...['-metadata', `title=Rubinny — ${poweredBy(lang)}`],
          ...['-metadata', 'comment=https://github.com/diamondrubinny/freescreensign'],
          video,
        ],
        async (stdin) => {
          try {
            for (let frame = 0; frame < frames; frame++) {
              await page.evaluate((t) => window.seek(t), frame / FPS);
              const png = await page.screenshot({ type: 'png' });
              if (!stdin.write(png)) await new Promise((r) => stdin.once('drain', r));
              if (frame % (FPS * 5) === 0) process.stdout.write(`${name}: ${frame / FPS}s\n`);
            }
          } catch (error) {
            failure = error;
          } finally {
            stdin.end();
          }
        },
      );
      await encoding;
      if (failure) throw failure;

      // Poster: the end card.
      await page.evaluate(() => window.seek(29));
      await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 88 });
      await page.close();
      process.stdout.write(`${name}: done\n`);
    }
  }
} finally {
  await browser.close();
}
