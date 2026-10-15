import { PlayerApi } from './api';
import { CacheStorageBlobStore, MediaCache } from './media-cache';
import { Player } from './player';
import { DomRenderer } from './renderer';
import { PlayerSocket } from './socket';
import { store } from './store';

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

const player = new Player({
  api,
  renderer: new DomRenderer(root),
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
});

void player.start();
