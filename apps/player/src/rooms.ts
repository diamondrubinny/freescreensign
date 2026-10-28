// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { RoomResult } from './api';

/**
 * What the built-in room widget may do beyond the public widget SDK: book or end a meeting
 * at the screen, and hear that a room's bookings changed. Community widgets never get this
 * (the SDK's context has no write access); main.ts connects it to the player API.
 */
export interface RoomActions {
  book(roomId: string, minutes: number, pin: string): Promise<RoomResult>;
  end(roomId: string, bookingId: string, pin: string): Promise<RoomResult>;
}

type Listener = () => void;

class RoomHost {
  #actions: RoomActions | null = null;
  readonly #listeners = new Map<string, Set<Listener>>();

  connect(actions: RoomActions) {
    this.#actions = actions;
  }

  book(roomId: string, minutes: number, pin: string): Promise<RoomResult> {
    if (!this.#actions) return Promise.resolve({ ok: false, code: 'NETWORK' });
    return this.#actions.book(roomId, minutes, pin);
  }

  end(roomId: string, bookingId: string, pin: string): Promise<RoomResult> {
    if (!this.#actions) return Promise.resolve({ ok: false, code: 'NETWORK' });
    return this.#actions.end(roomId, bookingId, pin);
  }

  /** Calls `listener` when the room's bookings change, until `signal` aborts. */
  onChange(roomId: string, signal: AbortSignal, listener: Listener) {
    const set = this.#listeners.get(roomId) ?? new Set<Listener>();
    set.add(listener);
    this.#listeners.set(roomId, set);
    signal.addEventListener(
      'abort',
      () => {
        set.delete(listener);
        if (set.size === 0) this.#listeners.delete(roomId);
      },
      { once: true },
    );
  }

  changed(roomId: string) {
    for (const listener of this.#listeners.get(roomId) ?? []) {
      try {
        listener();
      } catch {
        // One widget's failure must not affect the others.
      }
    }
  }
}

export const roomHost = new RoomHost();
