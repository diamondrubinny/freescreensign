import { join } from 'node:path';
import sharp, { type Metadata } from 'sharp';
import {
  MAX_IMAGE_PIXELS,
  MAX_VIDEO_DURATION_MS,
  THUMBNAIL_WIDTH,
  VIDEO_CODECS,
  type MediaFailureReason,
} from '../media/types.js';
import { ExecError, run } from './exec.js';

/** A deterministic, user-facing failure: the job must not be retried. */
export class MediaRejectedError extends Error {
  constructor(
    readonly reason: MediaFailureReason,
    detail?: string,
  ) {
    super(detail ?? reason);
    this.name = 'MediaRejectedError';
  }
}

export interface ProcessedMedia {
  outputPath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  durationMs: number | null;
}

// Never let libvips use more than one thread per job, and cap its cache.
sharp.concurrency(1);
sharp.cache({ memory: 64, files: 0, items: 50 });

/**
 * Re-encodes an image: applies EXIF orientation, strips all metadata (EXIF/GPS/XMP)
 * and rejects decompression bombs via limitInputPixels.
 */
export async function processImage(
  inputPath: string,
  workDir: string,
  mime: string,
): Promise<ProcessedMedia> {
  const open = () =>
    sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error', sequentialRead: true });
  let metadata: Metadata;
  try {
    metadata = await open().metadata();
  } catch (error) {
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new MediaRejectedError('too_many_pixels');
    }
    throw new MediaRejectedError(
      'corrupt_file',
      error instanceof Error ? error.message : undefined,
    );
  }
  if ((metadata.pages ?? 1) > 1)
    throw new MediaRejectedError('unsupported_type', 'animated images are not supported');

  const outputPath = join(workDir, 'output');
  const thumbnailPath = join(workDir, 'thumbnail.webp');
  try {
    // sharp drops metadata by default (no .keepMetadata()).
    const pipeline = open().rotate();
    if (mime === 'image/png') await pipeline.png({ compressionLevel: 9 }).toFile(outputPath);
    else if (mime === 'image/webp') await pipeline.webp({ quality: 90 }).toFile(outputPath);
    else await pipeline.jpeg({ quality: 90, mozjpeg: true }).toFile(outputPath);

    const info = await sharp(outputPath).metadata();
    await sharp(outputPath)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbnailPath);
    return { outputPath, thumbnailPath, width: info.width, height: info.height, durationMs: null };
  } catch (error) {
    if (error instanceof MediaRejectedError) throw error;
    throw new MediaRejectedError(
      'corrupt_file',
      error instanceof Error ? error.message : undefined,
    );
  }
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

/**
 * Remuxes a video without re-encoding (-c copy), dropping all metadata (GPS,
 * device info) and moving the index to the front for fast playback start.
 */
export async function processVideo(
  inputPath: string,
  workDir: string,
  outputExt: 'mp4' | 'webm',
): Promise<ProcessedMedia> {
  let probe: { streams?: ProbeStream[]; format?: { duration?: string } };
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', inputPath],
      { timeoutMs: 60_000 },
    );
    probe = JSON.parse(stdout) as typeof probe;
  } catch (error) {
    throw new MediaRejectedError(
      'corrupt_file',
      error instanceof ExecError ? error.stderr : undefined,
    );
  }

  const video = probe.streams?.find((s) => s.codec_type === 'video');
  if (!video?.codec_name || !video.width || !video.height)
    throw new MediaRejectedError('corrupt_file', 'no video stream');
  if (!VIDEO_CODECS.has(video.codec_name))
    throw new MediaRejectedError('unsupported_codec', video.codec_name);
  const durationMs = Math.round(Number(probe.format?.duration ?? 0) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new MediaRejectedError('corrupt_file', 'unknown duration');
  if (durationMs > MAX_VIDEO_DURATION_MS) throw new MediaRejectedError('too_long');

  const outputPath = join(workDir, `output.${outputExt}`);
  const framePath = join(workDir, 'frame.png');
  const thumbnailPath = join(workDir, 'thumbnail.webp');
  const timeoutMs = Math.max(120_000, durationMs / 4);
  try {
    await run(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputPath,
        // Keep first video + optional first audio stream only; drop data/subtitle streams.
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        '-c',
        'copy',
        ...(outputExt === 'mp4' ? ['-movflags', '+faststart'] : []),
        outputPath,
      ],
      { timeoutMs },
    );
    const seek = Math.min(1, durationMs / 2000).toFixed(2);
    await run(
      'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        seek,
        '-i',
        outputPath,
        '-frames:v',
        '1',
        framePath,
      ],
      { timeoutMs: 60_000 },
    );
    await sharp(framePath, { limitInputPixels: MAX_IMAGE_PIXELS })
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(thumbnailPath);
  } catch (error) {
    throw new MediaRejectedError(
      'corrupt_file',
      error instanceof ExecError ? error.stderr : undefined,
    );
  }
  return { outputPath, thumbnailPath, width: video.width, height: video.height, durationMs };
}
