// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomStatusData } from '@rubinny/shared';
import { roomHost } from '../src/rooms';
import { BUILT_IN_WIDGETS } from '../src/widgets';
import { roomState } from '../src/widgets/room';
import { WidgetRuntime } from '../src/widgets/runtime';

const NOW = new Date('2026-11-02T08:05:00Z'); // 10:05 in Jerusalem
const ROOM = '7d3e3b0e-8c43-4f43-9a52-2b2b3c1f0a11';
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function status(overrides: Partial<RoomStatusData> = {}): RoomStatusData {
  return {
    room: { name: 'חדר ישיבות', location: 'קומה 3', capacity: 12 },
    serverTime: NOW.toISOString(),
    current: null,
    upcoming: [],
    bookingEnabled: true,
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mountRoom(data: () => RoomStatusData, config: object = {}) {
  const fetchData = vi.fn(() => Promise.resolve(data()));
  const runtime = new WidgetRuntime({
    registry: BUILT_IN_WIDGETS,
    fetchData,
    mediaUrl: () => Promise.resolve(null),
    timezone: () => 'Asia/Jerusalem',
    now: () => NOW,
    reducedMotion: () => false,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const controller = new AbortController();
  const ok = runtime.mount(
    { id: 'w', type: 'room', config: { roomId: ROOM, ...config } },
    container,
    controller.signal,
  );
  await flush();
  return { container, controller, ok, fetchData };
}

const text = (root: ParentNode, selector: string) =>
  root.querySelector(selector)?.textContent.trim() ?? '';
const buttons = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLButtonElement>('.w-room-button'),
];

afterEach(() => {
  document.body.replaceChildren();
});

describe('room widget', () => {
  it('joins back-to-back meetings when saying until when the room is busy', () => {
    const now = NOW.getTime();
    const meeting = (from: number, to: number) => ({
      start: now + from * 60_000,
      end: now + to * 60_000,
      title: null,
      screenBookingId: null,
    });
    const state = roomState(
      [meeting(30, 60), meeting(-10, 20), meeting(20, 30), meeting(90, 120)],
      now,
    );
    expect(state.current?.start).toBe(now - 10 * 60_000);
    expect(state.busyUntil).toBe(now + 60 * 60_000);
    expect(state.next?.start).toBe(now + 20 * 60_000);
    expect(roomState([], now)).toMatchObject({ current: null, next: null, busyUntil: null });
  });

  it('shows a free room in words and an icon, with the next meetings', async () => {
    const { container, ok } = await mountRoom(() =>
      status({
        upcoming: [{ startsAt: at(55), endsAt: at(115), title: 'תכנון', screenBookingId: null }],
      }),
    );
    expect(ok).toBe(true);
    const root = container.querySelector('.w-room');
    expect(root?.classList.contains('w-room--free')).toBe(true);
    expect(text(container, '.w-room-name')).toBe('חדר ישיבות');
    expect(text(container, '.w-room-place')).toBe('קומה 3 · 12 מקומות');
    expect(text(container, '.w-room-state')).toBe('פנוי');
    expect(text(container, '.w-room-until')).toBe('פנוי עד 11:00');
    expect(container.querySelector('.w-room-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(text(container, '.w-room-next-list')).toContain('11:00–12:00');
    expect(text(container, '.w-room-next-list')).toContain('תכנון');
    // 60 minutes would run into the next meeting.
    expect(buttons(container).map((b) => [b.textContent, b.disabled])).toEqual([
      ['15 דק׳', false],
      ['30 דק׳', false],
      ['60 דק׳', true],
    ]);
    expect(buttons(container)[0]?.getAttribute('aria-label')).toBe('הזמנת החדר ל-15 דקות');
  });

  it('shows a busy room until its end, and no booking buttons', async () => {
    const { container } = await mountRoom(() =>
      status({
        current: { startsAt: at(-20), endsAt: at(40), title: null, screenBookingId: null },
      }),
    );
    expect(container.querySelector('.w-room')?.classList.contains('w-room--busy')).toBe(true);
    expect(text(container, '.w-room-state')).toBe('תפוס');
    expect(text(container, '.w-room-until')).toBe('תפוס עד 10:45');
    expect(buttons(container)).toEqual([]);
  });

  it('books with the PIN pad, and says why it failed', async () => {
    let booked = false;
    const book = vi.fn((_room: string, _minutes: number, pin: string) =>
      Promise.resolve(
        pin === '1234'
          ? ((booked = true), { ok: true as const })
          : { ok: false as const, code: 'WRONG_PIN' },
      ),
    );
    roomHost.connect({ book, end: () => Promise.resolve({ ok: true }) });
    const { container, fetchData } = await mountRoom(() =>
      booked
        ? status({
            current: { startsAt: at(0), endsAt: at(30), title: null, screenBookingId: 'b1' },
          })
        : status(),
    );
    buttons(container)[1]?.click();
    const pad = container.querySelector<HTMLElement>('.w-room-pin');
    expect(pad?.hidden).toBe(false);
    expect(pad?.getAttribute('role')).toBe('dialog');
    expect(pad?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement?.textContent).toBe('1');

    const press = (label: string) => {
      [...container.querySelectorAll<HTMLButtonElement>('.w-room-key')]
        .find((k) => k.getAttribute('aria-label') === label)
        ?.click();
    };
    for (const d of ['9', '9', '9', '9']) press(`ספרה ${d}`);
    expect(container.querySelector('.w-room-pin-dots')?.getAttribute('aria-label')).toBe(
      'הוקלדו 4 ספרות',
    );
    press('אישור');
    await flush();
    expect(book).toHaveBeenCalledWith(ROOM, 30, '9999');
    expect(text(container, '.w-room-pin-error')).toBe('הקוד שגוי. נסו שוב.');
    expect(container.querySelector('.w-room-pin-error')?.getAttribute('role')).toBe('alert');

    for (const d of ['1', '2', '3', '4']) press(`ספרה ${d}`);
    press('אישור');
    await flush();
    await flush();
    expect(pad?.hidden).toBe(true);
    expect(text(container, '.w-room-notice')).toMatch(/^החדר הוזמן עד/);
    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(text(container, '.w-room-state')).toBe('תפוס');
    // Booked at this screen: it can be ended here.
    expect(text(container, '.w-room-end')).toBe('סיום הפגישה עכשיו');
  });

  it('refreshes when the server says the room changed', async () => {
    const { fetchData, controller } = await mountRoom(() => status());
    expect(fetchData).toHaveBeenCalledTimes(1);
    roomHost.changed(ROOM);
    roomHost.changed('00000000-0000-4000-8000-000000000000');
    await flush();
    expect(fetchData).toHaveBeenCalledTimes(2);
    controller.abort();
    roomHost.changed(ROOM);
    await flush();
    expect(fetchData).toHaveBeenCalledTimes(2);
  });

  it('says the room is not available once it is deleted, instead of the old status', async () => {
    let deleted = false;
    const runtime = new WidgetRuntime({
      registry: BUILT_IN_WIDGETS,
      fetchData: () => {
        if (!deleted) return Promise.resolve(status());
        const gone = new Error('gone');
        gone.name = 'WidgetDataGoneError';
        return Promise.reject(gone);
      },
      mediaUrl: () => Promise.resolve(null),
      timezone: () => 'Asia/Jerusalem',
      now: () => NOW,
      reducedMotion: () => false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    runtime.mount(
      { id: 'w', type: 'room', config: { roomId: ROOM } },
      container,
      new AbortController().signal,
    );
    await flush();
    expect(buttons(container)).toHaveLength(3);
    deleted = true;
    roomHost.changed(ROOM);
    await flush();
    const root = container.querySelector('.w-room')!;
    expect(root.classList.contains('w-room--unavailable')).toBe(true);
    expect(text(root, '.w-room-state')).toBe('החדר אינו זמין');
    expect(buttons(container)).toHaveLength(0);
  });

  it('hides booking when the organization has no PIN, and speaks English', async () => {
    const { container } = await mountRoom(() => status({ bookingEnabled: false }), {
      locale: 'en',
    });
    expect(text(container, '.w-room-state')).toBe('Free');
    expect(text(container, '.w-room-until')).toBe('Free for the rest of the day');
    expect(buttons(container)).toEqual([]);
    expect(container.querySelector('.w-room')?.getAttribute('dir')).toBe('ltr');
  });
});
