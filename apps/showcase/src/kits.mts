// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Writes the starter kits as the player would get them (zones, widgets with defaults) and
 * draws their art as PNG files, for src/screens.mjs. Run with tsx from this package.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { parseWidgetConfig, templateZones } from '@rubinny/shared';
import { ART_NAMES, artSvg } from '../../server/src/modules/kits/art.ts';
import { resolveArt } from '../../server/src/modules/kits/kit-design.ts';
import { ALL_STARTER_KITS } from '../../server/src/modules/kits/kits.ts';

const out = process.argv[2];
if (!out) throw new Error('Usage: kits.mts <output directory>');
mkdirSync(`${out}/art`, { recursive: true });

// Media ids stand for the art; the page maps them back to the PNG files.
const ids = new Map(
  ART_NAMES.map((name, i) => [name, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`]),
);
for (const name of ART_NAMES) {
  await sharp(Buffer.from(artSvg(name)))
    .png()
    .toFile(`${out}/art/${name}.png`);
}

const kits: Record<string, unknown> = {};
for (const kit of ALL_STARTER_KITS) {
  for (const locale of ['he', 'en'] as const) {
    const widgets = new Map(
      kit.widgets.map((widget) => {
        let config = { ...widget.config[locale] };
        if (widget.type === 'design') config = resolveArt(config, ids);
        // Two weeks after the pictures' clock (see entry.ts).
        if (widget.type === 'countdown') config.target = '2026-11-05T18:00';
        const parsed = parseWidgetConfig(widget.type, config);
        if (!parsed.success)
          throw new Error(`${kit.id}/${widget.key}: ${JSON.stringify(parsed.issues)}`);
        return [
          widget.key,
          { id: `${kit.id}-${widget.key}`, type: widget.type, config: parsed.config },
        ];
      }),
    );
    kits[`${kit.id}-${locale}`] = {
      background: kit.background,
      zones: templateZones(kit.template, { width: 1920, height: 1080 }).map((zone) => ({
        x: zone.x,
        y: zone.y,
        w: zone.w,
        h: zone.h,
        items: (kit.zones[zone.name]?.widgets ?? [])
          .map((item) => widgets.get(typeof item === 'string' ? item : item.key))
          .filter(Boolean),
      })),
    };
  }
}
const art = Object.fromEntries([...ids].map(([name, id]) => [id, name]));
writeFileSync(
  `${out}/kits.js`,
  `window.KITS = ${JSON.stringify(kits)};\nwindow.ART = ${JSON.stringify(art)};\n`,
);
