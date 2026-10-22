// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

// Rubinny player service worker: keeps the player app itself available offline.
// Media is cached separately by the player (Cache Storage, sha256-verified).
const SHELL_CACHE = 'rubinny-player-shell-v1';

/**
 * Precache the app shell on install: index.html plus the hashed assets it
 * references, so the player can boot offline even right after first load.
 */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch('/player/', { cache: 'no-store' });
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put('/player/', response);
  const assets = [...html.matchAll(/(?:src|href)="(\/player\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(
    assets.map((url) =>
      fetch(url)
        .then((res) => (res.ok ? cache.put(url, res) : undefined))
        .catch(() => undefined),
    ),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheShell()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShell =
    event.request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/player/') &&
    !url.pathname.startsWith('/player/v1/');
  if (!isShell) return;
  // Network first (fresh app after deploys), cache fallback (offline boot).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || caches.match('/player/'))
          .then((r) => r || Response.error()),
      ),
  );
});
