// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/** Media kinds and the content types accepted for each (detected from file bytes). */
export type MediaKind = 'image' | 'video';

export interface AcceptedType {
  kind: MediaKind;
  /** MIME type of the stored, processed file. */
  outputMime: string;
  outputExt: string;
}

export const ACCEPTED_TYPES: Record<string, AcceptedType> = {
  'image/jpeg': { kind: 'image', outputMime: 'image/jpeg', outputExt: 'jpg' },
  'image/png': { kind: 'image', outputMime: 'image/png', outputExt: 'png' },
  'image/webp': { kind: 'image', outputMime: 'image/webp', outputExt: 'webp' },
  'video/mp4': { kind: 'video', outputMime: 'video/mp4', outputExt: 'mp4' },
  // iPhone videos: remuxed (not re-encoded) into MP4.
  'video/quicktime': { kind: 'video', outputMime: 'video/mp4', outputExt: 'mp4' },
  'video/webm': { kind: 'video', outputMime: 'video/webm', outputExt: 'webm' },
};

export const MEDIA_STATUSES = [
  'uploading',
  'queued',
  'processing',
  'ready',
  'blocked',
  'failed',
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/** Stable failure reasons shown (translated) in the CMS. */
export type MediaFailureReason =
  | 'malware_detected'
  | 'unsupported_type'
  | 'corrupt_file'
  | 'too_large'
  | 'too_many_pixels'
  | 'too_long'
  | 'unsupported_codec'
  | 'processing_error';

export const VIDEO_CODECS = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1']);
export const MAX_IMAGE_PIXELS = 100_000_000;
export const MAX_VIDEO_DURATION_MS = 4 * 60 * 60 * 1000;
export const THUMBNAIL_WIDTH = 480;
