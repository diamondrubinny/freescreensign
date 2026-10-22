// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * A page that shows one starter kit on a 1920×1080 "screen" with the player's own widget
 * code and styles: ?kit=restaurant-he&slide=0 (the slide picks each zone's item).
 */
import '../../player/src/legacy';
import '@fontsource-variable/heebo';
import '@fontsource-variable/rubik';
import '@fontsource-variable/frank-ruhl-libre';
import '@fontsource/secular-one';
import '@fontsource/bebas-neue';
import '@rubinny/shared/design.css';
import '../../player/src/player.css';
import { BUILT_IN_WIDGETS } from '../../player/src/widgets/index';
import { WidgetRuntime } from '../../player/src/widgets/runtime';

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
  items: { id: string; type: string; config: Record<string, unknown> }[];
}
const page = window as unknown as {
  KITS: Record<string, { background: string; zones: Zone[] }>;
  ART: Record<string, string>;
  rendered?: boolean;
};
const params = new URLSearchParams(location.search);
const kit = page.KITS[params.get('kit') ?? ''];
const slide = Number(params.get('slide') ?? '0');
const runtime = new WidgetRuntime({
  registry: BUILT_IN_WIDGETS,
  // Server data (weather, feeds) is not part of the pictures.
  fetchData: () => Promise.reject(new Error('no data in pictures')),
  mediaUrl: (id) => Promise.resolve(page.ART[id] ? `art/${page.ART[id]}.png` : null),
  timezone: () => 'Asia/Jerusalem',
  // A fixed time, so every run makes the same pictures.
  now: () => new Date('2026-10-22T09:41:00+03:00'),
  reducedMotion: () => false,
});
const stage = document.getElementById('stage');
if (kit && stage) {
  stage.style.background = kit.background;
  for (const zone of kit.zones) {
    const element = document.createElement('div');
    element.className = 'zone';
    Object.assign(element.style, {
      position: 'absolute',
      left: `${String(zone.x)}px`,
      top: `${String(zone.y)}px`,
      width: `${String(zone.w)}px`,
      height: `${String(zone.h)}px`,
      overflow: 'hidden',
    });
    element.style.setProperty('--zone-w', `${String(zone.w)}px`);
    element.style.setProperty('--zone-h', `${String(zone.h)}px`);
    stage.append(element);
    const item = zone.items[slide % Math.max(zone.items.length, 1)];
    if (!item) continue;
    const layer = document.createElement('div');
    layer.className = 'layer widget';
    element.append(layer);
    runtime.mount(item, layer, new AbortController().signal);
  }
}
page.rendered = true;
