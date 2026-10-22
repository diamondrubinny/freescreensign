// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

export const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

/** JPEG with EXIF (artist/copyright) and orientation 6 (rotated 90°). */
export function jpegWithExif(width = 200, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2563eb' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: 'Secret Person', Copyright: 'Private Family' } })
    .toBuffer();
}

export function png(width = 64, height = 64): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: '#16a34a' } })
    .png()
    .toBuffer();
}

/** Short test video with identifying metadata (title + GPS location). */
export function mp4(options: { codec?: string; seconds?: number } = {}): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'rubinny-fixture-'));
  const out = join(dir, 'video.mp4');
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=320x240:rate=25:duration=${options.seconds ?? 2}`,
    '-c:v',
    options.codec ?? 'libx264',
    '-pix_fmt',
    'yuv420p',
    '-metadata',
    'title=Secret Title',
    '-metadata',
    'location=+32.0853+034.7818/',
    out,
  ]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  const data = readFileSync(out);
  rmSync(dir, { recursive: true, force: true });
  return data;
}

export function probeTags(path: string): Record<string, string> {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    path,
  ]);
  const parsed = JSON.parse(result.stdout.toString()) as {
    format?: { tags?: Record<string, string> };
  };
  return parsed.format?.tags ?? {};
}

export const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
