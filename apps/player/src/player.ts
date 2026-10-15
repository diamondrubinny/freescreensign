import type { ManifestV1 } from '@rubinny/shared';
import { PairingExpiredError, UnauthorizedError, type PlayerApi } from './api';
import type { MediaCache } from './media-cache';
import { wait, type Renderer } from './renderer';
import { activeLayout, flattenPlaylist, type PlayableItem } from './sequence';
import type { ServerEvent } from './socket';
import type { store as defaultStore } from './store';

export interface PlayerDeps {
  api: PlayerApi;
  renderer: Renderer;
  store: Pick<typeof defaultStore, 'token' | 'setToken' | 'manifest' | 'setManifest' | 'clear'>;
  createCache: (token: string) => MediaCache;
  createSocket: (
    token: string,
    onEvent: (e: ServerEvent) => void,
    onRevoked: () => void,
  ) => { start(): void; stop(): void };
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  reload: () => void;
  resolution: () => string;
  host: string;
  version: string;
  /** Called after a new manifest is accepted (e.g. to prune widget data). */
  onManifest?: (manifest: ManifestV1) => void;
}

export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const PAIR_POLL_MS = 3000;
const EMPTY_RETRY_MS = 10_000;
/** How often the schedule is re-evaluated (layout switches by time of day). */
export const SCHEDULE_CHECK_MS = 30_000;

const PAIRING_LINES = (host: string) => [
  `כדי להוסיף את המסך: היכנסו ל-Rubinny (${host}) › מסכים › הוספת מסך, והזינו את הקוד.`,
  `To add this screen: open Rubinny (${host}) › Screens › Add screen, and enter the code.`,
];

/** Player state machine: pairing → syncing → playing (with offline fallback). */
export class Player {
  #token: string | null = null;
  #manifest: ManifestV1 | null = null;
  #cache: MediaCache | null = null;
  #changed = false;
  #hasChanged(): boolean {
    return this.#changed;
  }
  #stopped = false;
  /** A method (not a field read) so async state changes aren't narrowed away by TypeScript. */
  #isStopped(): boolean {
    return this.#stopped;
  }
  #syncing: Promise<void> | null = null;
  #abort = new AbortController();
  offline = false;

  constructor(private readonly deps: PlayerDeps) {}

  get manifest() {
    return this.#manifest;
  }

  async start(): Promise<void> {
    this.#token = this.deps.store.token();
    if (!this.#token) this.#token = await this.#pair();
    if (this.#isStopped() || !this.#token) return;
    await this.#runPaired(this.#token);
  }

  stop() {
    this.#stopped = true;
    this.#abort.abort();
  }

  // ---------------------------------------------------------------- pairing
  async #pair(): Promise<string | null> {
    while (!this.#isStopped()) {
      let session: { code: string; pollToken: string };
      try {
        session = await this.deps.api.pairStart();
      } catch {
        this.deps.renderer.showMessage({
          title: 'אין חיבור לשרת · No connection',
          lines: ['מנסה שוב… · Retrying…'],
        });
        await this.deps.sleep(10_000);
        continue;
      }
      this.deps.renderer.showMessage({
        title: 'חיבור מסך · Pair this screen',
        code: session.code,
        lines: PAIRING_LINES(this.deps.host),
      });
      for (;;) {
        await this.deps.sleep(PAIR_POLL_MS);
        if (this.#isStopped()) return null;
        try {
          const status = await this.deps.api.pairStatus(session.pollToken);
          if (status.status === 'paired') {
            this.deps.store.setToken(status.deviceToken);
            return status.deviceToken;
          }
        } catch (error) {
          if (error instanceof PairingExpiredError) break; // new code
          // network hiccup: keep polling
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- running
  async #runPaired(token: string) {
    this.#cache = this.deps.createCache(token);
    this.#manifest = this.deps.store.manifest(); // offline boot from the last good manifest
    if (!this.#manifest)
      this.deps.renderer.showMessage({ title: 'טוען תוכן… · Loading…', lines: [] });

    const socket = this.deps.createSocket(
      token,
      (event) => {
        if (event.type === 'manifest.changed') void this.sync();
        if (event.type === 'reload') this.deps.reload();
      },
      () => {
        void this.#unpair();
      },
    );
    socket.start();
    void this.#loop(SYNC_INTERVAL_MS, () => this.sync());
    void this.#loop(HEARTBEAT_INTERVAL_MS, () => this.#heartbeat());
    void this.#loop(SCHEDULE_CHECK_MS, () => {
      this.#checkSchedule();
      return Promise.resolve();
    });
    await this.sync();
    await this.#playLoop();
    socket.stop();
  }

  async #loop(interval: number, task: () => Promise<void>) {
    while (!this.#isStopped()) {
      await this.deps.sleep(interval);
      if (this.#isStopped()) return;
      await task().catch(() => undefined);
    }
  }

  /** Fetches the manifest; downloads and verifies new media before switching. */
  sync(): Promise<void> {
    this.#syncing ??= this.#doSync().finally(() => {
      this.#syncing = null;
    });
    return this.#syncing;
  }

  async #doSync() {
    if (!this.#token || !this.#cache) return;
    try {
      const fresh = await this.deps.api.manifest(this.#token, this.#manifest?.version ?? null);
      this.offline = false;
      // 304, or a 200 with the same version (e.g. a proxy stripped the ETag): nothing to do.
      if (!fresh || fresh.version === this.#manifest?.version) return;
      const { failed } = await this.#cache.sync(fresh.media);
      if (failed.length > 0 && this.#manifest) return; // keep playing the old content; retry later
      this.#manifest = fresh;
      this.deps.store.setManifest(fresh);
      this.deps.onManifest?.(fresh);
      this.#restart();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        await this.#unpair();
        return;
      }
      this.offline = true; // keep playing from cache
    }
  }

  /** Interrupts all zones so the play loop picks up new content at once. */
  #restart() {
    this.#changed = true;
    this.#abort.abort();
    this.#abort = new AbortController();
  }

  #layoutId: string | null = null;

  #checkSchedule() {
    const manifest = this.#manifest;
    if (!manifest) return;
    const layout = activeLayout(manifest, this.deps.now());
    if ((layout?.id ?? null) !== this.#layoutId) this.#restart();
  }

  async #heartbeat() {
    if (!this.#token) return;
    try {
      await this.deps.api.heartbeat(this.#token, {
        manifestVersion: this.#manifest?.version ?? null,
        playerVersion: this.deps.version,
        resolution: this.deps.resolution(),
      });
    } catch (error) {
      if (error instanceof UnauthorizedError) await this.#unpair();
    }
  }

  async #unpair() {
    this.#stopped = true;
    this.#abort.abort();
    this.deps.store.clear();
    await this.#cache?.clear();
    this.deps.reload();
  }

  async #playLoop() {
    while (!this.#isStopped()) {
      const manifest = this.#manifest;
      const layout = manifest ? activeLayout(manifest, this.deps.now()) : null;
      const zones = (layout?.zones ?? []).map((zone) => ({
        id: zone.id,
        items: manifest ? flattenPlaylist(manifest, zone.playlistId) : [],
      }));
      this.#layoutId = layout?.id ?? null;
      if (manifest) this.deps.renderer.setOrientation(manifest.screen.orientation);
      if (!manifest || !layout || zones.every((zone) => zone.items.length === 0)) {
        if (manifest) {
          this.deps.renderer.showMessage({
            title: 'אין תוכן להצגה · Nothing to show',
            lines: [
              'שייכו פלייליסט או תבנית למסך זה ב-Rubinny.',
              'Assign a playlist or layout to this screen in Rubinny.',
            ],
          });
        }
        await this.deps.sleep(EMPTY_RETRY_MS);
        continue;
      }
      this.#changed = false;
      const signal = this.#abort.signal;
      this.deps.renderer.mountLayout(layout);
      // Every zone plays its own playlist until the content or the schedule changes.
      await Promise.all(zones.map((zone) => this.#runZone(zone.id, zone.items, signal)));
    }
  }

  async #runZone(zoneId: string, items: PlayableItem[], signal: AbortSignal) {
    const active = () => !signal.aborted && !this.#isStopped() && !this.#hasChanged();
    if (items.length === 0) {
      await wait(2 ** 31 - 1, signal); // an empty zone shows the background until a change
      return;
    }
    while (active()) {
      let played = 0;
      for (const item of items) {
        if (!active()) return;
        let url: string | null = null;
        if (item.kind === 'media') {
          url = (await this.#cache?.objectUrl(item.media)) ?? null;
          if (!url) continue; // not cached (yet): skip
        }
        await this.deps.renderer.play(zoneId, item, url, signal);
        played++;
      }
      // Nothing playable (e.g. all downloads failed): avoid a busy loop.
      if (played === 0) await wait(EMPTY_RETRY_MS, signal);
    }
  }
}
