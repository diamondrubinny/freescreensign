// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  alertActive,
  type ManifestAlert,
  type ManifestLayout,
  type ManifestV1,
  type ManifestZoneAction,
  type NowPlayingItem,
  type RubinnyNativeBridge,
} from '@rubinny/shared';
import { PairingExpiredError, UnauthorizedError, type PlayerApi } from './api';
import type { MediaCache } from './media-cache';
import { captureBytes } from './native';
import type { PlayLog } from './play-log';
import { wait, type Renderer } from './renderer';
import {
  activeLayout,
  flattenPlaylist,
  itemShowing,
  syncedPosition,
  type PlayableItem,
} from './sequence';
import type { ServerEvent } from './socket';
import type { store as defaultStore } from './store';

export interface PlayerDeps {
  api: PlayerApi;
  renderer: Renderer;
  store: Pick<
    typeof defaultStore,
    | 'token'
    | 'setToken'
    | 'manifest'
    | 'setManifest'
    | 'clear'
    | 'clockOffset'
    | 'setClockOffset'
    | 'alert'
    | 'setAlert'
  >;
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
  /** Proof-of-play log (kept locally until uploaded). */
  playLog: PlayLog;
  /** The native wrapper bridge, when running inside one (see native.ts). */
  native?: RubinnyNativeBridge | null;
  /** A booking of a room changed (room widgets refresh; see rooms.ts). */
  onRoomChanged?: (roomId: string) => void;
}

export const SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
/** How often the proof-of-play log is uploaded. */
export const PLAYS_UPLOAD_MS = 30_000;
/** Shorter displays (skipped or interrupted at once) are not counted as plays. */
export const MIN_PLAY_MS = 1000;
export const PAIR_POLL_MS = 3000;
const EMPTY_RETRY_MS = 10_000;
/** How often the schedule is re-evaluated (layout switches by time of day). */
export const SCHEDULE_CHECK_MS = 30_000;
/** How often an alert's end time is checked (it ends on the screen even offline). */
export const ALERT_CHECK_MS = 1000;
/** Touch screens: layouts opened by taps that can be stacked (oldest dropped beyond it). */
const MAX_TOUCH_STACK = 10;
const DEFAULT_IDLE_SECONDS = 60;
/** Clock samples with a slower round trip are too imprecise to use. */
const MAX_CLOCK_RTT_MS = 10_000;

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

  /** Device clock minus server clock (ms). */
  #clockOffset: number;
  /** The alert from the latest manifest (shown while active), and whether it is on screen. */
  #alert: ManifestAlert | null = null;
  #alertShown: string | null = null;
  /** What each zone shows right now (reported in the heartbeat). */
  #playing = new Map<string, NowPlayingItem>();
  /** Touch screens: layouts opened by taps, newest last; empty shows the scheduled layout. */
  #touchStack: string[] = [];
  /** Device time (ms) of the latest touch or key. */
  #lastActivity = 0;

  constructor(private readonly deps: PlayerDeps) {
    this.#clockOffset = deps.store.clockOffset();
  }

  /** The current time on the server's clock (corrects a wrong device clock). */
  now(): Date {
    return new Date(this.deps.now().getTime() - this.#clockOffset);
  }

  get manifest() {
    return this.#manifest;
  }

  /** Object URL of a media item of the current manifest (verified cache), or null. */
  async mediaUrl(mediaId: string): Promise<string | null> {
    const media = this.#manifest?.media.find((m) => m.id === mediaId);
    if (!media || !this.#cache) return null;
    return this.#cache.objectUrl(media);
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
    this.#alert = this.deps.store.alert();
    this.#applyAlert();
    if (!this.#manifest)
      this.deps.renderer.showMessage({ title: 'טוען תוכן… · Loading…', lines: [] });

    const socket = this.deps.createSocket(
      token,
      (event) => {
        if (event.type === 'manifest.changed') void this.sync();
        if (event.type === 'reload') this.deps.reload();
        if (event.type === 'screenshot') void this.#screenshot(event.requestId);
        if (event.type === 'room.changed') this.deps.onRoomChanged?.(event.roomId);
      },
      () => {
        void this.#unpair();
      },
    );
    socket.start();
    void this.#loop(SYNC_INTERVAL_MS, () => this.sync());
    void this.#loop(HEARTBEAT_INTERVAL_MS, () => this.#heartbeat());
    void this.#loop(PLAYS_UPLOAD_MS, () => this.uploadPlays());
    void this.#loop(ALERT_CHECK_MS, () => {
      this.#applyAlert();
      this.#checkIdle();
      return Promise.resolve();
    });
    void this.#loop(SCHEDULE_CHECK_MS, () => {
      this.#checkSchedule();
      return Promise.resolve();
    });
    await this.sync();
    // Report status at once, so the CMS shows the screen online with its resolution.
    void this.#heartbeat();
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
      // Alerts go on screen at once, before any (possibly slow) media download.
      this.#setAlert(fresh.alert ?? null);
      const { failed } = await this.#cache.sync(fresh.media);
      if (failed.length > 0 && this.#manifest) return; // keep playing the old content; retry later
      this.#manifest = fresh;
      // Layouts that are gone can no longer be shown or returned to.
      this.#touchStack = this.#touchStack.filter((id) => fresh.layouts.some((l) => l.id === id));
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

  #setAlert(alert: ManifestAlert | null) {
    if (JSON.stringify(alert) === JSON.stringify(this.#alert)) return;
    this.#alert = alert;
    this.deps.store.setAlert(alert);
    this.#applyAlert();
  }

  /** Shows the alert while it is active, on the server's clock; hides it afterwards. */
  #applyAlert() {
    const alert = alertActive(this.#alert, this.now()) ? this.#alert : null;
    const key = alert ? JSON.stringify(alert) : null;
    if (key === this.#alertShown) return;
    this.#alertShown = key;
    this.deps.renderer.showAlert(alert);
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
    const layout = this.#currentLayout(manifest);
    if ((layout?.id ?? null) !== this.#layoutId) this.#restart();
  }

  /** The layout opened by the latest tap, if any; otherwise the scheduled one. */
  #currentLayout(manifest: ManifestV1): ManifestLayout | null {
    const top = this.#touchStack[this.#touchStack.length - 1];
    return (
      (top ? manifest.layouts.find((layout) => layout.id === top) : undefined) ??
      activeLayout(manifest, this.now())
    );
  }

  /** A tap (or Enter/Space) on a zone with an action. */
  #onTouchAction(action: ManifestZoneAction) {
    this.#lastActivity = this.deps.now().getTime();
    const manifest = this.#manifest;
    if (!manifest) return;
    if (action.type === 'back') {
      if (this.#touchStack.length === 0) return;
      this.#touchStack.pop();
    } else {
      const scheduled = activeLayout(manifest, this.now());
      const index = this.#touchStack.indexOf(action.layoutId);
      if (action.layoutId === scheduled?.id)
        this.#touchStack = []; // "home"
      else if (index >= 0)
        this.#touchStack.length = index + 1; // back to an opened layout
      else this.#touchStack = [...this.#touchStack, action.layoutId].slice(-MAX_TOUCH_STACK);
    }
    this.#restart();
  }

  /** Without a touch for the layout's idle time, the scheduled content returns. */
  #checkIdle() {
    const manifest = this.#manifest;
    if (!manifest || this.#touchStack.length === 0) return;
    const idleSeconds = this.#currentLayout(manifest)?.idleSeconds ?? DEFAULT_IDLE_SECONDS;
    if (this.deps.now().getTime() - this.#lastActivity < idleSeconds * 1000) return;
    this.#touchStack = [];
    this.#restart();
  }

  async #heartbeat() {
    if (!this.#token) return;
    try {
      const sent = this.deps.now().getTime();
      const result = await this.deps.api.heartbeat(this.#token, {
        manifestVersion: this.#manifest?.version ?? null,
        playerVersion: this.deps.version,
        resolution: this.deps.resolution(),
        clockOffsetMs: Math.round(this.#clockOffset),
        layoutId: this.#layoutId,
        nowPlaying: [...this.#playing.entries()].map(([zoneId, item]) => ({ ...item, zoneId })),
        platform: this.deps.native?.platform ?? 'web',
        capabilities: [...(this.deps.native?.capabilities ?? [])],
      });
      const received = this.deps.now().getTime();
      const server = result ? Date.parse(result.serverTime) : Number.NaN;
      // The server stamped its time about halfway through the round trip.
      if (Number.isFinite(server) && received - sent <= MAX_CLOCK_RTT_MS) {
        this.#clockOffset = Math.round((sent + received) / 2 - server);
        this.deps.store.setClockOffset(this.#clockOffset);
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) await this.#unpair();
    }
  }

  /** Captures the screen through the native wrapper and answers the request. */
  async #screenshot(requestId: string): Promise<void> {
    const capture = this.deps.native?.capture;
    if (!this.#token || !capture) return; // a plain browser cannot take screenshots
    try {
      const jpeg = captureBytes(await capture());
      await this.deps.api.uploadScreenshot(this.#token, requestId, jpeg);
    } catch (error) {
      if (error instanceof UnauthorizedError) await this.#unpair();
    }
  }

  /** Uploads the oldest logged plays; keeps them for a later try on transient errors. */
  async uploadPlays(): Promise<void> {
    const token = this.#token;
    const batch = this.deps.playLog.peek();
    if (!token || batch.length === 0) return;
    try {
      const result = await this.deps.api.plays(token, batch);
      if (result === 'done') this.deps.playLog.ack(batch.map((event) => event.id));
    } catch (error) {
      if (error instanceof UnauthorizedError) await this.#unpair();
    }
  }

  async #unpair() {
    this.#stopped = true;
    this.#abort.abort();
    this.deps.store.clear();
    this.deps.playLog.clear();
    await this.#cache?.clear();
    this.deps.reload();
  }

  async #playLoop() {
    while (!this.#isStopped()) {
      const manifest = this.#manifest;
      const layout = manifest ? this.#currentLayout(manifest) : null;
      const zones = (layout?.zones ?? []).map((zone) => ({
        id: zone.id,
        items: manifest ? flattenPlaylist(manifest, zone.playlistId) : [],
      }));
      this.#layoutId = layout?.id ?? null;
      if (manifest) {
        this.deps.renderer.setOrientation(manifest.screen.orientation);
        this.deps.renderer.setWall(manifest.screen.wall ?? null);
      }
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
      this.#playing.clear();
      this.deps.renderer.mountLayout(layout, {
        onAction: (action) => {
          this.#onTouchAction(action);
        },
        onActivity: () => {
          this.#lastActivity = this.deps.now().getTime();
        },
      });
      // Every zone plays its own playlist until the content or the schedule changes.
      const synced = Boolean(manifest.screen.wall);
      const showing = (item: PlayableItem) =>
        itemShowing(item, this.now(), manifest.screen.timezone);
      await Promise.all(
        zones.map((zone) =>
          synced
            ? this.#runSyncedZone(zone.id, zone.items, showing, signal)
            : this.#runZone(zone.id, zone.items, showing, signal),
        ),
      );
    }
  }

  /**
   * Video walls: what plays is a function of the server's clock, so every screen of the wall
   * shows the same item at the same moment; each item ends on the clock (no drift builds up).
   */
  async #runSyncedZone(
    zoneId: string,
    all: PlayableItem[],
    showing: (item: PlayableItem) => boolean,
    signal: AbortSignal,
  ) {
    const active = () => !signal.aborted && !this.#isStopped() && !this.#hasChanged();
    if (all.length === 0) {
      await wait(2 ** 31 - 1, signal);
      return;
    }
    while (active()) {
      // Every screen of the wall shares the clock, so they all drop the same items.
      const items = all.filter(showing);
      if (items.length === 0) {
        this.#nothingShowing(zoneId);
        await wait(this.#untilNextMinute(), signal);
        continue;
      }
      const { index, offsetMs } = syncedPosition(items, this.now().getTime());
      const item = items[index];
      if (!item) return;
      // A window that opens or closes takes effect when this item ends (the same moment on
      // every screen of the wall).
      const remaining = item.durationMs - offsetMs;
      const url =
        item.kind === 'media' ? ((await this.#cache?.objectUrl(item.media)) ?? null) : null;
      if (item.kind === 'media' && !url) {
        await wait(remaining, signal); // not cached (yet): keep the place in the loop
        continue;
      }
      const ref = item.kind === 'media' ? item.media.id : item.widget.id;
      this.#playing.set(zoneId, { zoneId, kind: item.kind, ref });
      const started = this.now();
      const timed: PlayableItem =
        item.kind === 'media'
          ? { ...item, durationMs: remaining, startAtMs: offsetMs }
          : { ...item, durationMs: remaining };
      await this.deps.renderer.play(zoneId, timed, url, signal);
      const durationMs = this.now().getTime() - started.getTime();
      // Ended early (e.g. a video failed): keep the slot instead of retrying in a loop.
      if (remaining - durationMs > 50) await wait(remaining - durationMs, signal);
      if (durationMs >= MIN_PLAY_MS) {
        this.deps.playLog.add({
          zoneId,
          kind: item.kind,
          ref,
          startedAt: started.toISOString(),
          durationMs: Math.min(durationMs, 86_400_000),
        });
      }
    }
  }

  async #runZone(
    zoneId: string,
    items: PlayableItem[],
    showing: (item: PlayableItem) => boolean,
    signal: AbortSignal,
  ) {
    const active = () => !signal.aborted && !this.#isStopped() && !this.#hasChanged();
    if (items.length === 0) {
      await wait(2 ** 31 - 1, signal); // an empty zone shows the background until a change
      return;
    }
    while (active()) {
      let played = 0;
      let inWindow = 0;
      for (const item of items) {
        if (!active()) return;
        if (!showing(item)) continue; // outside its time window
        inWindow++;
        let url: string | null = null;
        if (item.kind === 'media') {
          url = (await this.#cache?.objectUrl(item.media)) ?? null;
          if (!url) continue; // not cached (yet): skip
        }
        const ref = item.kind === 'media' ? item.media.id : item.widget.id;
        this.#playing.set(zoneId, { zoneId, kind: item.kind, ref });
        const started = this.now();
        await this.deps.renderer.play(zoneId, item, url, signal);
        const durationMs = this.now().getTime() - started.getTime();
        if (durationMs >= MIN_PLAY_MS) {
          this.deps.playLog.add({
            zoneId,
            kind: item.kind,
            ref,
            startedAt: started.toISOString(),
            durationMs: Math.min(durationMs, 86_400_000),
          });
        }
        played++;
      }
      // Nothing in its window: the zone shows its background until a window opens.
      if (inWindow === 0) {
        this.#nothingShowing(zoneId);
        await wait(this.#untilNextMinute(), signal);
      } else if (played === 0) {
        // Nothing playable (e.g. all downloads failed): avoid a busy loop.
        await wait(EMPTY_RETRY_MS, signal);
      }
    }
  }

  #nothingShowing(zoneId: string) {
    this.#playing.delete(zoneId);
    this.deps.renderer.clearZone(zoneId);
  }

  /** Windows are set in minutes: they open and close on the minute. */
  #untilNextMinute(): number {
    return 60_000 - (this.now().getTime() % 60_000) + 50;
  }
}
