import { PLAY_LIMITS, type PlayEvent } from '@rubinny/shared';

/** Where the log is kept between restarts (localStorage in the browser). */
export interface PlayLogStorage {
  load(): unknown;
  save(events: readonly PlayEvent[]): void;
}

const KEY = 'rubinny.player.plays';

export const localPlayLogStorage: PlayLogStorage = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as unknown) : [];
    } catch {
      return [];
    }
  },
  save(events) {
    try {
      if (events.length === 0) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify(events));
    } catch {
      // Storage full or blocked: the log still works for this session.
    }
  },
};

export const memoryPlayLogStorage = (): PlayLogStorage & { saved: PlayEvent[] } => {
  const state = { saved: [] as PlayEvent[] };
  return {
    get saved() {
      return state.saved;
    },
    load: () => state.saved,
    save(events) {
      state.saved = [...events];
    },
  };
};

/** A random v4 UUID, also on older TV browsers without crypto.randomUUID. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Proof-of-play log: what was shown, where and for how long. Kept locally (bounded,
 * oldest dropped first) until the server acknowledges it, so offline plays are not lost.
 */
export class PlayLog {
  #events: PlayEvent[];

  constructor(
    private readonly storage: PlayLogStorage,
    private readonly limit: number = PLAY_LIMITS.queue,
  ) {
    const loaded = storage.load();
    this.#events = Array.isArray(loaded) ? (loaded as PlayEvent[]).slice(-limit) : [];
  }

  get size(): number {
    return this.#events.length;
  }

  add(event: Omit<PlayEvent, 'id'>): void {
    this.#events.push({ id: uuid(), ...event });
    if (this.#events.length > this.limit) this.#events.splice(0, this.#events.length - this.limit);
    this.storage.save(this.#events);
  }

  /** The oldest events, up to one upload. */
  peek(count: number = PLAY_LIMITS.batch): PlayEvent[] {
    return this.#events.slice(0, count);
  }

  /** Removes events the server has handled. */
  ack(ids: readonly string[]): void {
    const done = new Set(ids);
    this.#events = this.#events.filter((event) => !done.has(event.id));
    this.storage.save(this.#events);
  }

  clear(): void {
    this.#events = [];
    this.storage.save(this.#events);
  }
}
