// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { designMediaIds, parseWidgetConfig } from '../src/index.js';

const media = '3f8a6b1e-2c4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('design widget', () => {
  it('fills defaults and keeps element order', () => {
    const result = parseWidgetConfig('design', {
      elements: [
        { id: 'bg', kind: 'shape', x: 0, y: 0, w: 1920, h: 1080 },
        { id: 't1', kind: 'text', x: 100, y: 100, w: 800, h: 200, text: 'שלום' },
        { id: 'i1', kind: 'image', x: 1000, y: 100, w: 600, h: 400, mediaId: media },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config).toMatchObject({
      width: 1920,
      height: 1080,
      elements: [
        { kind: 'shape', fill: '#4f46e5', rotation: 0, opacity: 1 },
        { kind: 'text', fontSize: 64, align: 'center', color: '#ffffff' },
        { kind: 'image', fit: 'cover' },
      ],
    });
  });

  it('rejects unsafe or invalid content', () => {
    const bad = (element: Record<string, unknown>) =>
      parseWidgetConfig('design', { elements: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, ...element }] })
        .success;
    expect(bad({ kind: 'text', text: 'x', color: 'red; background:url(x)' })).toBe(false);
    expect(bad({ kind: 'image', mediaId: '../../etc/passwd' })).toBe(false);
    expect(bad({ kind: 'script', src: 'x' })).toBe(false);
    expect(bad({ kind: 'shape', w: 0 })).toBe(false);
    expect(
      parseWidgetConfig('design', {
        elements: [
          { id: 'a', kind: 'shape', x: 0, y: 0, w: 1, h: 1 },
          { id: 'a', kind: 'shape', x: 0, y: 0, w: 1, h: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('lists referenced media once', () => {
    expect(
      designMediaIds({
        backgroundMediaId: media,
        elements: [
          {
            id: 'i',
            kind: 'image',
            mediaId: media,
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            fit: 'cover',
            radius: 0,
            alt: '',
            rotation: 0,
            opacity: 1,
          },
        ],
      }),
    ).toEqual([media]);
  });
});
