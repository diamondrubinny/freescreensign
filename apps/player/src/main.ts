import '@fontsource-variable/heebo';
import { PlayerApi } from './api';
import { CacheStorageBlobStore, MediaCache } from './media-cache';
import { Player } from './player';
import { DomRenderer } from './renderer';
import { PlayerSocket } from './socket';
import { store } from './store';
import { WidgetDataClient } from './widget-data';
import { BUILT_IN_WIDGETS } from './widgets';
import { WidgetRuntime } from './widgets/runtime';

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
});

void player.start();
