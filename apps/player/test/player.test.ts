import { describe, expect, it, vi } from 'vitest';
import type { ManifestV1 } from '@rubinny/shared';
import { PairingExpiredError, UnauthorizedError, type PlayerApi } from '../src/api';
import { MediaCache, MemoryBlobStore } from '../src/media-cache';
import { Player, type PlayerDeps } from '../src/player';
import type { Renderer } from '../src/renderer';
import type { PlayableItem } from '../src/sequence';
import type { ServerEvent } from '../src/socket';
import { manifest, sha256Hex } from './fixtures';

const bytes = new Uint8Array([7, 7, 7]);
const idOf = (item: PlayableItem) => (item.kind === 'media' ? item.media.id : item.widget.id);

async function realManifest(version = 'v1'): Promise<ManifestV1> {
  const sha = await sha256Hex(bytes);
  const m = manifest({ version });
  m.media = m.media.map((item) => ({ ...item, sha256: sha }));
  return m;
}

function memoryStore(
  initial: { token?: string; manifest?: ManifestV1; clockOffset?: number } = {},
) {
  let token = initial.token ?? null;
  let saved: ManifestV1 | null = initial.manifest ?? null;
  let offset = initial.clockOffset ?? 0;
  return {
    clockOffset: () => offset,
    setClockOffset: (value: number) => {
      offset = value;
    },
    token: () => token,
    setToken: (t: string | null) => {
      token = t;
    },
    manifest: () => saved,
    setManifest: (m: ManifestV1 | null) => {
      saved = m;
    },
    clear: vi.fn(() => {
      token = null;
      saved = null;
    }),
  };
}

function setup(options: {
  api: Partial<PlayerApi>;
  store: ReturnType<typeof memoryStore>;
  stopAfterPlays?: number;
  now?: () => Date;
  blobStore?: MemoryBlobStore;
  download?: () => Promise<Blob>;
}) {
  const played: PlayableItem[] = [];
  const zonesPlayed: string[] = [];
  const messages: { title: string; code?: string }[] = [];
  let emit: (e: ServerEvent) => void = () => undefined;
  const ref: { player?: Player } = {};
  const renderer: Renderer = {
    setOrientation: vi.fn(),
    showMessage: (m) => messages.push(m),
    clear: vi.fn(),
    mountLayout: vi.fn(),
    play: (zoneId, item) => {
      played.push(item);
      zonesPlayed.push(zoneId);
      if (played.length >= (options.stopAfterPlays ?? 3)) ref.player?.stop();
      // Each item takes a real (short) tick, like a timer-driven display.
      return new Promise((resolve) => setTimeout(resolve, 1));
    },
  };
  const reload = vi.fn(() => {
    ref.player?.stop();
  });
  const deps: PlayerDeps = {
    api: options.api as PlayerApi,
    renderer,
    store: options.store,
    createCache: () =>
      new MediaCache(
        options.blobStore ?? new MemoryBlobStore(),
        options.download ?? (() => Promise.resolve(new Blob([bytes]))),
      ),
    createSocket: (_token, onEvent) => {
      emit = onEvent;
      return { start: vi.fn(), stop: vi.fn() };
    },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 0)),
    now: options.now ?? (() => new Date('2026-10-15T10:00:00Z')),
    reload,
    resolution: () => '1920x1080',
    host: 'signage.example.com',
    version: 'test',
  };
  const player = new Player(deps);
  ref.player = player;
  return {
    player,
    played,
    zonesPlayed,
    messages,
    reload,
    emit: (e: ServerEvent) => {
      emit(e);
    },
  };
}

describe('Player', () => {
  it('pairs, stores the token, then downloads and plays the playlist in order', async () => {
    const m = await realManifest();
    const pairStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'paired', deviceToken: 'device-token' });
    const store = memoryStore();
    const { player, played, messages } = setup({
      store,
      api: {
        pairStart: vi
          .fn()
          .mockResolvedValue({ code: 'K7Q-29M', pollToken: 'poll', expiresIn: 600 }),
        pairStatus,
        manifest: vi.fn().mockResolvedValue(m),
        heartbeat: vi.fn().mockResolvedValue(undefined),
      },
    });
    await player.start();
    expect(messages[0]).toMatchObject({ code: 'K7Q-29M' });
    expect(store.token()).toBe('device-token');
    expect(played.map(idOf)).toEqual(['m1', 'm2', 'm1']);
    expect(store.manifest()?.version).toBe('v1');
  });

  it('requests a new code when the pairing code expires', async () => {
    const pairStart = vi
      .fn()
      .mockResolvedValueOnce({ code: 'AAA-AAA', pollToken: 'p1', expiresIn: 600 })
      .mockResolvedValueOnce({ code: 'BBB-BBB', pollToken: 'p2', expiresIn: 600 });
    const pairStatus = vi
      .fn()
      .mockRejectedValueOnce(new PairingExpiredError())
      .mockResolvedValue({ status: 'paired', deviceToken: 't' });
    const { player, messages } = setup({
      store: memoryStore(),
      api: {
        pairStart,
        pairStatus,
        manifest: vi.fn().mockResolvedValue(await realManifest()),
        heartbeat: vi.fn(),
      },
    });
    await player.start();
    expect(messages.map((m) => m.code).filter(Boolean)).toEqual(['AAA-AAA', 'BBB-BBB']);
  });

  it('boots offline and keeps playing from the cache', async () => {
    const m = await realManifest();
    // Media cached during an earlier online session.
    const blobStore = new MemoryBlobStore();
    await new MediaCache(blobStore, () => Promise.resolve(new Blob([bytes]))).sync(m.media);
    const download = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const { player, played } = setup({
      store: memoryStore({ token: 't', manifest: m }),
      api: {
        manifest: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
        heartbeat: vi.fn(),
      },
      blobStore,
      download,
    });
    await player.start();
    expect(player.offline).toBe(true);
    expect(played.map(idOf)).toEqual(['m1', 'm2', 'm1']);
    expect(download).not.toHaveBeenCalled();
  });

  it('unpairs and reloads when the device token is revoked', async () => {
    const store = memoryStore({ token: 'revoked' });
    const { player, reload } = setup({
      store,
      api: { manifest: vi.fn().mockRejectedValue(new UnauthorizedError()), heartbeat: vi.fn() },
    });
    await player.start();
    expect(store.clear).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
    expect(store.token()).toBeNull();
  });

  it('switches to new content after a manifest.changed event', async () => {
    const v1 = await realManifest('v1');
    const v2 = await realManifest('v2');
    v2.playlists = [
      { id: 'p1', items: [{ kind: 'media', ref: 'm2', durationMs: 1000, transition: 'none' }] },
    ];
    const manifestFn = vi.fn().mockResolvedValueOnce(v1).mockResolvedValue(v2);
    const ctx = setup({
      store: memoryStore({ token: 't' }),
      api: { manifest: manifestFn, heartbeat: vi.fn() },
      stopAfterPlays: 20,
    });
    const run = ctx.player.start();
    await vi.waitUntil(() => ctx.played.length >= 2);
    ctx.emit({ type: 'manifest.changed' });
    await run;
    expect(idOf(ctx.played.at(-1)!)).toBe('m2');
    expect(ctx.player.manifest?.version).toBe('v2');
  });

  it('plays every zone of a layout independently, including widgets', async () => {
    const m = await realManifest();
    m.widgets = [{ id: 'w-ticker', type: 'ticker', config: { text: 'שלום' } }];
    m.playlists.push({
      id: 'p-ticker',
      items: [{ kind: 'widget', ref: 'w-ticker', durationMs: 60_000, transition: 'none' }],
    });
    m.layouts = [
      {
        id: 'lobby',
        width: 1920,
        height: 1080,
        zones: [
          { id: 'main', x: 0, y: 0, w: 1920, h: 950, z: 0, playlistId: 'p1' },
          { id: 'ticker', x: 0, y: 950, w: 1920, h: 130, z: 1, playlistId: 'p-ticker' },
          { id: 'empty', x: 0, y: 0, w: 10, h: 10, z: 2, playlistId: null },
        ],
      },
    ];
    m.schedule.defaultLayoutId = 'lobby';
    const ctx = setup({
      store: memoryStore({ token: 't' }),
      api: { manifest: vi.fn().mockResolvedValue(m), heartbeat: vi.fn() },
      stopAfterPlays: 4,
    });
    await ctx.player.start();
    expect(new Set(ctx.zonesPlayed)).toEqual(new Set(['main', 'ticker']));
    expect(ctx.played.filter((p) => p.kind === 'widget').map(idOf)).toContain('w-ticker');
  });

  it('corrects a wrong device clock with the server time, also for the schedule', async () => {
    const m = await realManifest();
    m.screen.timezone = 'UTC';
    const main = m.layouts[0]!;
    m.layouts.push({ ...main, id: 'morning', zones: [{ ...main.zones[0]!, id: 'm-zone' }] });
    // Active on the server clock (09:15), not on the device clock (10:00).
    m.schedule.entries = [
      { id: 'e', layoutId: 'morning', priority: 1, timeFrom: '09:00', timeTo: '09:30' },
    ];
    const heartbeat = vi.fn().mockResolvedValue({ serverTime: '2026-10-15T09:15:00Z' });
    const store = memoryStore({ token: 't' });
    const ctx = setup({
      store,
      api: { manifest: vi.fn().mockResolvedValue(m), heartbeat },
      stopAfterPlays: 30,
    });
    await ctx.player.start();
    expect(store.clockOffset()).toBe(45 * 60 * 1000);
    expect(ctx.player.now().toISOString()).toBe('2026-10-15T09:15:00.000Z');
    expect(ctx.zonesPlayed).toContain('m-zone');
    // The heartbeat reports the offset, the layout and what each zone shows.
    expect(heartbeat.mock.calls.at(-1)?.[1]).toMatchObject({
      clockOffsetMs: 45 * 60 * 1000,
      layoutId: 'morning',
      nowPlaying: [{ zoneId: 'm-zone', kind: 'media' }],
    });
  });

  it('keeps the stored offset across restarts and ignores slow clock samples', async () => {
    const m = await realManifest();
    const store = memoryStore({ token: 't', clockOffset: 5000 });
    let tick = Date.parse('2026-10-15T10:00:00Z');
    const ctx = setup({
      store,
      api: {
        manifest: vi.fn().mockResolvedValue(m),
        // Each heartbeat takes 20 s (simulated), too slow to measure the clock.
        heartbeat: vi.fn(() => {
          tick += 20_000;
          return Promise.resolve({ serverTime: '2026-10-15T00:00:00Z' });
        }),
      },
      now: () => new Date(tick),
    });
    await ctx.player.start();
    expect(store.clockOffset()).toBe(5000);
  });
});
