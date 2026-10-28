// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import { formatHebrewDate, hebrewNumeral } from '../src/hebrew.js';
import { WIDGET_TYPES, parseWidgetConfig } from '../src/widgets.js';

describe('hebrewNumeral', () => {
  it.each([
    [1, 'א׳'],
    [4, 'ד׳'],
    [10, 'י׳'],
    [11, 'י״א'],
    [15, 'ט״ו'],
    [16, 'ט״ז'],
    [23, 'כ״ג'],
    [30, 'ל׳'],
    [100, 'ק׳'],
    [787, 'תשפ״ז'],
    [785, 'תשפ״ה'],
    [999, 'תתקצ״ט'],
  ])('%i → %s', (value, expected) => {
    expect(hebrewNumeral(value)).toBe(expected);
  });

  it('rejects out-of-range values', () => {
    expect(() => hebrewNumeral(0)).toThrow(RangeError);
    expect(() => hebrewNumeral(1000)).toThrow(RangeError);
  });
});

describe('formatHebrewDate', () => {
  it('formats with Hebrew numerals and the screen time zone', () => {
    expect(formatHebrewDate(new Date('2026-10-15T10:00:00Z'), 'Asia/Jerusalem')).toBe(
      'ד׳ בחשוון תשפ״ז',
    );
    // 22:30 UTC is already the next day in Jerusalem.
    expect(formatHebrewDate(new Date('2026-10-15T22:30:00Z'), 'Asia/Jerusalem')).toBe(
      'ה׳ בחשוון תשפ״ז',
    );
  });
});

describe('parseWidgetConfig', () => {
  it('fills defaults', () => {
    const result = parseWidgetConfig('clock', {});
    expect(result).toEqual({
      success: true,
      config: expect.objectContaining({
        format: '24h',
        showHebrewDate: true,
        textColor: '#ffffff',
      }) as unknown,
    });
  });

  it('rejects unknown types, bad colors, non-https URLs and unknown time zones', () => {
    expect(parseWidgetConfig('evil', {}).success).toBe(false);
    expect(parseWidgetConfig('text', { text: 'x', textColor: 'red' }).success).toBe(false);
    expect(parseWidgetConfig('qr', { url: 'http://example.com' }).success).toBe(false);
    expect(parseWidgetConfig('qr', { url: 'javascript:alert(1)' }).success).toBe(false);
    expect(parseWidgetConfig('webpage', { url: 'https://example.com' }).success).toBe(true);
    expect(parseWidgetConfig('clock', { timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(
      parseWidgetConfig('weather', { latitude: 95, longitude: 0, locationName: 'x' }).success,
    ).toBe(false);
  });

  it('accepts http and https feeds for RSS (fetched server-side)', () => {
    expect(parseWidgetConfig('rss', { url: 'http://feeds.example.com/a.xml' }).success).toBe(true);
    expect(parseWidgetConfig('rss', { url: 'file:///etc/passwd' }).success).toBe(false);
  });

  it('lists all built-in types', () => {
    expect(WIDGET_TYPES).toEqual([
      'clock',
      'text',
      'ticker',
      'qr',
      'rss',
      'weather',
      'webpage',
      'countdown',
      'table',
      'menu',
      'design',
      'room',
      'calendar',
    ]);
  });
});
