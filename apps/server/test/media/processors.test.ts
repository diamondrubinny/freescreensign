// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaRejectedError, processImage, processVideo } from '../../src/worker/processors.js';
import { hasFfmpeg, jpegWithExif, mp4, probeTags } from './fixtures.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rubinny-proc-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(name: string, data: Buffer) {
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
}

describe('processImage', () => {
  it('strips EXIF metadata and applies orientation', async () => {
    const input = await write('in.jpg', await jpegWithExif(200, 100));
    const before = await sharp(input).metadata();
    expect(before.orientation).toBe(6);
    expect(before.exif?.toString('latin1')).toContain('Secret Person');

    const result = await processImage(input, dir, 'image/jpeg');
    const meta = await sharp(result.outputPath).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Orientation 6 = rotate 90°, so dimensions are swapped.
    expect([result.width, result.height]).toEqual([100, 200]);
    const thumb = await sharp(result.thumbnailPath).metadata();
    expect(thumb.format).toBe('webp');
  });

  it('rejects decompression bombs', async () => {
    const bomb = await sharp({
      create: { width: 12_000, height: 12_000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const input = await write('bomb.png', bomb);
    await expect(processImage(input, dir, 'image/png')).rejects.toMatchObject({
      reason: 'too_many_pixels',
    });
  });

  it('rejects corrupt images', async () => {
    const good = await jpegWithExif();
    const input = await write('bad.jpg', good.subarray(0, 200));
    await expect(processImage(input, dir, 'image/jpeg')).rejects.toBeInstanceOf(MediaRejectedError);
  });
});

describe.runIf(hasFfmpeg)('processVideo', () => {
  it('remuxes without metadata, extracts duration and a thumbnail', async () => {
    const input = await write('in.mp4', mp4({ seconds: 2 }));
    expect(probeTags(input)).toMatchObject({ title: 'Secret Title' });

    const result = await processVideo(input, dir, 'mp4');
    expect(result.width).toBe(320);
    expect(result.height).toBe(240);
    expect(result.durationMs).toBeGreaterThan(1900);
    expect(result.durationMs).toBeLessThan(2200);
    const tags = probeTags(result.outputPath);
    expect(tags.title).toBeUndefined();
    expect(tags.location).toBeUndefined();
    expect((await sharp(result.thumbnailPath).metadata()).format).toBe('webp');
  }, 30_000);

  it('rejects unsupported codecs and corrupt files', async () => {
    const legacy = await write('legacy.mp4', mp4({ codec: 'mpeg4', seconds: 1 }));
    await expect(processVideo(legacy, dir, 'mp4')).rejects.toMatchObject({
      reason: 'unsupported_codec',
    });
    const garbage = await write(
      'garbage.mp4',
      Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(500, 1)]),
    );
    await expect(processVideo(garbage, dir, 'mp4')).rejects.toMatchObject({
      reason: 'corrupt_file',
    });
  }, 30_000);
});
