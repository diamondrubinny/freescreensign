// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

export type RangeResult =
  { type: 'full' } | { type: 'partial'; start: number; end: number } | { type: 'unsatisfiable' };

/** Parses a single-range "Range: bytes=..." header (multi-range requests get the full body). */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { type: 'full' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { type: 'full' };
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return { type: 'unsatisfiable' };
  if (size === 0) return { type: 'unsatisfiable' };

  let start: number;
  let end: number;
  if (startText === '') {
    const suffix = Number(endText);
    if (suffix === 0) return { type: 'unsatisfiable' };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return { type: 'unsatisfiable' };
  }
  return { type: 'partial', start, end };
}
