// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseWidgetConfig, templateZones, type DesignConfig } from '@rubinny/shared';
import { ART, ART_NAMES, artSvg } from '../src/modules/kits/art.js';
import { artNames, resolveArt } from '../src/modules/kits/kit-design.js';
import { ALL_STARTER_KITS } from '../src/modules/kits/kits.js';

/** WCAG relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** A #rrggbbaa color over an opaque #rrggbb one. */
function over(color: string, base: string): string {
  if (color.length !== 9) return color.slice(0, 7);
  const alpha = parseInt(color.slice(7), 16) / 255;
  const mix = (index: number) => {
    const top = parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
    const bottom = parseInt(base.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(top * alpha + bottom * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(0)}${mix(1)}${mix(2)}`;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const fakeIds = new Map(
  ART_NAMES.map((name, index) => [
    name,
    `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  ]),
);

/** What the route does before saving: art ids, and a countdown target in the future. */
function prepare(type: string, config: Record<string, unknown>): Record<string, unknown> {
  if (type === 'design') return resolveArt(config, fakeIds);
  if (type === 'countdown') return { ...config, target: '2030-01-01T10:00' };
  return config;
}

/** The color right behind a text: its own box, else the topmost opaque shape under it, else the canvas. */
function behindText(design: DesignConfig, index: number): string {
  const element = design.elements[index]!;
  const canvas = design.background.slice(0, 7);
  if (element.kind === 'text' && element.background) return over(element.background, canvas);
  const cx = element.x + element.w / 2;
  const cy = element.y + element.h / 2;
  for (let i = index - 1; i >= 0; i--) {
    const below = design.elements[i]!;
    if (below.kind !== 'shape' || below.fill.length !== 7 || below.opacity < 0.95) continue;
    if (cx >= below.x && cx <= below.x + below.w && cy >= below.y && cy <= below.y + below.h) {
      return below.fill;
    }
  }
  return canvas;
}

describe('starter kits', () => {
  const cases = ALL_STARTER_KITS.flatMap((kit) =>
    (['he', 'en'] as const).map((locale) => [kit.id, locale, kit] as const),
  );

  it.each(cases)('%s (%s): every widget is valid, and zones and keys match', (_id, locale, kit) => {
    const zones = new Set(
      templateZones(kit.template, { width: 1920, height: 1080 }).map((z) => z.name),
    );
    const keys = new Set(kit.widgets.map((widget) => widget.key));
    expect(keys.size).toBe(kit.widgets.length);
    for (const [zone, spec] of Object.entries(kit.zones)) {
      expect(zones.has(zone), `${kit.id}: zone ${zone}`).toBe(true);
      for (const item of spec.widgets) {
        expect(keys.has(typeof item === 'string' ? item : item.key)).toBe(true);
      }
    }
    for (const widget of kit.widgets) {
      for (const name of artNames(widget.config[locale])) {
        expect(ART_NAMES, `${kit.id}/${widget.key}`).toContain(name);
      }
      const config = prepare(widget.type, widget.config[locale]);
      const parsed = parseWidgetConfig(widget.type, config);
      expect(parsed.success, `${kit.id}/${widget.key}: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it.each(cases)('%s (%s): text is readable on its background (WCAG AA)', (_id, locale, kit) => {
    for (const widget of kit.widgets) {
      const parsed = parseWidgetConfig(widget.type, prepare(widget.type, widget.config[locale]));
      if (!parsed.success) continue;
      const config = parsed.config;
      const where = `${kit.id}/${widget.key}`;
      if (typeof config.textColor === 'string' && typeof config.background === 'string') {
        expect(contrast(config.textColor, config.background), where).toBeGreaterThanOrEqual(4.5);
      }
      if (widget.type === 'menu') {
        // Prices and headings are large and bold.
        expect(
          contrast(config.accent as string, config.background as string),
          where,
        ).toBeGreaterThanOrEqual(3);
      }
      if (widget.type === 'design') {
        const design = config as unknown as DesignConfig;
        for (const [index, element] of design.elements.entries()) {
          if (element.kind !== 'text') continue;
          const behind = behindText(design, index);
          const large =
            element.fontSize >= 40 || (element.fontSize >= 31 && element.fontWeight >= 600);
          expect(
            contrast(element.color.slice(0, 7), behind),
            `${where}: "${element.text.slice(0, 30)}"`,
          ).toBeGreaterThanOrEqual(large ? 3 : 4.5);
        }
      }
    }
  });

  it.each(cases)('%s (%s): text and pictures stay inside their canvas', (_id, locale, kit) => {
    for (const widget of kit.widgets.filter((w) => w.type === 'design')) {
      const design = widget.config[locale] as unknown as DesignConfig;
      for (const element of design.elements) {
        if (element.kind === 'shape') continue; // decoration may bleed off the edges
        const where = `${kit.id}/${widget.key}/${element.id}`;
        expect(element.x, where).toBeGreaterThanOrEqual(0);
        expect(element.y, where).toBeGreaterThanOrEqual(0);
        expect(element.x + element.w, where).toBeLessThanOrEqual(design.width);
        expect(element.y + element.h, where).toBeLessThanOrEqual(design.height);
      }
    }
  });

  it('has the seven kits by trade, after the general ones', () => {
    expect(ALL_STARTER_KITS.map((kit) => kit.id)).toEqual([
      'lobby',
      'menu',
      'info',
      'restaurant',
      'cafe',
      'cinema',
      'retail',
      'office',
      'hotel',
      'community',
    ]);
  });

  it('drops pictures it cannot add, instead of pointing at nothing', () => {
    const config = {
      backgroundMediaId: 'art:ember',
      elements: [
        { id: 'a', kind: 'image', mediaId: 'art:dish' },
        { id: 'b', kind: 'text', text: 'x' },
      ],
    };
    expect(resolveArt(config, new Map())).toEqual({
      elements: [{ id: 'b', kind: 'text', text: 'x' }],
    });
    expect(resolveArt(config, fakeIds)).toMatchObject({
      backgroundMediaId: fakeIds.get('ember'),
      elements: [{ mediaId: fakeIds.get('dish') }, { id: 'b' }],
    });
  });
});

describe('art pack', () => {
  it.each(ART_NAMES)('%s renders to a PNG of its size', async (name) => {
    const png = await sharp(Buffer.from(artSvg(name)))
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([ART[name].width, ART[name].height]);
    expect(png.length).toBeLessThan(1_500_000);
  });

  it('is the same on every run (no randomness between servers)', () => {
    for (const name of ART_NAMES) expect(artSvg(name)).toBe(artSvg(name));
  });
});
