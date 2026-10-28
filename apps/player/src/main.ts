// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import './legacy';
import { detectNative } from './native';
import { PlayLog, localPlayLogStorage } from './play-log';
import '@fontsource-variable/heebo';
import '@fontsource-variable/rubik';
import '@fontsource-variable/frank-ruhl-libre';
import '@fontsource/secular-one';
import '@fontsource/bebas-neue';
import '@rubinny/shared/design.css';
import { PlayerApi } from './api';
import { CacheStorageBlobStore, MediaCache } from './media-cache';
import { Player } from './player';
import { DomRenderer } from './renderer';
import { PlayerSocket } from './socket';
import { roomHost } from './rooms';
import { store } from './store';
import { WidgetDataClient } from './widget-data';
import { BUILT_IN_WIDGETS } from './widgets';
import { WidgetRuntime } from './widgets/runtime';
import { ATTRIBUTION_BANNER, enableStrictCspValidation } from '@rubinny/shared';

enableStrictCspValidation();
// The attribution, for anyone who opens the developer tools (LICENSING.md).
// eslint-disable-next-line no-console
console.info(ATTRIBUTION_BANNER);

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .register('/player/sw.js', { scope: '/player/' })
    .catch(() => undefined);
}
// Ask the browser not to evict cached media under storage pressure.
// (Older TV browsers may lack the Storage API.)
if ('storage' in navigator && typeof navigator.storage.persist === 'function') {
  void navigator.storage.persist().catch(() => false);
}

const api = new PlayerApi();
const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/player/v1/ws`;
const widgetData = new WidgetDataClient(api, () => store.token(), store);
const reducedMotion =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

let player: Player | null = null;
const widgets = new WidgetRuntime({
  registry: BUILT_IN_WIDGETS,
  fetchData: (widgetId) => widgetData.get(widgetId),
  mediaUrl: (mediaId) => player?.mediaUrl(mediaId) ?? Promise.resolve(null),
  timezone: () => player?.manifest?.screen.timezone ?? 'Asia/Jerusalem',
  // Widgets (clock, countdown) show the server-corrected time.
  now: () => player?.now() ?? new Date(),
  reducedMotion: () => reducedMotion?.matches ?? false,
});

player = new Player({
  api,
  renderer: new DomRenderer(root, widgets),
  store,
  createCache: (token) => new MediaCache(new CacheStorageBlobStore(), (id) => api.media(token, id)),
  createSocket: (token, onEvent, onRevoked) => new PlayerSocket(wsUrl, token, onEvent, onRevoked),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  reload: () => {
    location.reload();
  },
  resolution: () =>
    `${String(Math.round(screen.width * devicePixelRatio))}x${String(Math.round(screen.height * devicePixelRatio))}`,
  host: location.host,
  version: __PLAYER_VERSION__,
  onManifest: (manifest) => {
    store.pruneWidgetData(manifest.widgets.map((widget) => widget.id));
  },
  playLog: new PlayLog(localPlayLogStorage),
  native: detectNative(),
  onRoomChanged: (roomId) => {
    roomHost.changed(roomId);
  },
});

// Booking at a room's screen (the room widget), with the device token.
roomHost.connect({
  book: (roomId, minutes, pin) => {
    const token = store.token();
    return token
      ? api.bookRoom(token, roomId, minutes, pin)
      : Promise.resolve({ ok: false, code: 'NETWORK' });
  },
  end: (roomId, bookingId, pin) => {
    const token = store.token();
    return token
      ? api.endRoomBooking(token, roomId, bookingId, pin)
      : Promise.resolve({ ok: false, code: 'NETWORK' });
  },
});

void player.start();
