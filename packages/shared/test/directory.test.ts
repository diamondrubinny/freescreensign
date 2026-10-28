// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { parseWidgetConfig, widgetMediaIds } from '../src/index.js';

const MAP = '7d3e3b0e-8c43-4f43-9a52-2b2b3c1f0a11';

describe('directory widget', () => {
  it('fills defaults and keeps floors, categories and entries', () => {
    const result = parseWidgetConfig('directory', {
      floors: [{ name: '1' }, { name: '2', mapMediaId: MAP }],
      categories: ['רפואה'],
      entries: [{ name: ' מרפאה ', floor: '2', category: 'רפואה', direction: 'left' }],
    });
    expect(result).toMatchObject({
      success: true,
      config: {
        idleSeconds: 60,
        pageSeconds: 10,
        locale: 'he',
        entries: [{ name: 'מרפאה', floor: '2', category: 'רפואה', direction: 'left' }],
      },
    });
  });

  it('refuses unknown floors and categories, duplicate floors and bad directions', () => {
    const issues = (config: object) => {
      const result = parseWidgetConfig('directory', config);
      return result.success ? [] : result.issues.map((issue) => issue.path);
    };
    expect(
      issues({
        floors: [{ name: '1' }, { name: '1' }],
        categories: ['A'],
        entries: [
          { name: 'X', floor: '9' },
          { name: 'Y', floor: '1', category: 'B' },
        ],
      }),
    ).toEqual(['floors.1.name', 'entries.0.floor', 'entries.1.category']);
    expect(
      issues({
        floors: [{ name: '1' }],
        entries: [{ name: 'X', floor: '1', direction: 'up-left' }],
      }),
    ).toEqual(['entries.0.direction']);
    expect(issues({ floors: [], entries: [] })).toEqual(['floors', 'entries']);
  });

  it('lists the images a widget shows', () => {
    expect(
      widgetMediaIds('directory', {
        floors: [{ name: '1', mapMediaId: MAP }, { name: '2' }, { name: '3', mapMediaId: MAP }],
      }),
    ).toEqual([MAP]);
    expect(widgetMediaIds('clock', {})).toEqual([]);
  });
});
