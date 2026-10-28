// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  hour23,
  roomConfigSchema,
  type RoomStatusData,
  type RoomStatusMeeting,
  type WidgetConfig,
} from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';
import { roomHost } from '../rooms';

type RoomConfig = WidgetConfig<'room'>;

const REFRESH_MS = 60_000;
const TICK_MS = 15_000;
/** The PIN pad closes by itself when nobody touches it. */
const PIN_IDLE_MS = 30_000;
const MINUTES = [15, 30, 60] as const;
/** Unique ids for the PIN pads' titles (aria-labelledby). */
let padCount = 0;

const TEXT = {
  he: {
    free: 'פנוי',
    busy: 'תפוס',
    freeUntil: (t: string) => `פנוי עד ${t}`,
    freeAllDay: 'פנוי בהמשך היום',
    busyUntil: (t: string) => `תפוס עד ${t}`,
    meeting: 'פגישה',
    next: 'בהמשך',
    nothingNext: 'אין פגישות נוספות היום',
    bookNow: 'הזמנה עכשיו',
    minutes: (m: number) => `${String(m)} דק׳`,
    minutesLong: (m: number) => `הזמנת החדר ל-${String(m)} דקות`,
    endNow: 'סיום הפגישה עכשיו',
    seats: (n: number) => `${String(n)} מקומות`,
    pinTitle: 'הקלידו את קוד ההזמנה',
    pinBook: (m: number) => `הזמנה ל-${String(m)} דקות`,
    pinEnd: 'סיום הפגישה',
    digit: (d: string) => `ספרה ${d}`,
    erase: 'מחיקת ספרה',
    confirm: 'אישור',
    cancel: 'ביטול',
    entered: (n: number) => `הוקלדו ${String(n)} ספרות`,
    booked: (t: string) => `החדר הוזמן עד ${t}`,
    ended: 'הפגישה הסתיימה. החדר פנוי.',
    errors: {
      WRONG_PIN: 'הקוד שגוי. נסו שוב.',
      RATE_LIMITED: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
      ROOM_BUSY: 'החדר כבר תפוס בזמן הזה.',
      BOOKING_DISABLED: 'הזמנה מהמסך אינה זמינה.',
      NOT_FOUND: 'הזמנה מהמסך אינה זמינה.',
      other: 'אין חיבור לשרת. נסו שוב.',
    },
    unavailable: 'החדר אינו זמין',
  },
  en: {
    free: 'Free',
    busy: 'Busy',
    freeUntil: (t: string) => `Free until ${t}`,
    freeAllDay: 'Free for the rest of the day',
    busyUntil: (t: string) => `Busy until ${t}`,
    meeting: 'Meeting',
    next: 'Next',
    nothingNext: 'No more meetings today',
    bookNow: 'Book now',
    minutes: (m: number) => `${String(m)} min`,
    minutesLong: (m: number) => `Book the room for ${String(m)} minutes`,
    endNow: 'End the meeting now',
    seats: (n: number) => `${String(n)} seats`,
    pinTitle: 'Enter the booking PIN',
    pinBook: (m: number) => `Book for ${String(m)} minutes`,
    pinEnd: 'End the meeting',
    digit: (d: string) => `Digit ${d}`,
    erase: 'Delete a digit',
    confirm: 'OK',
    cancel: 'Cancel',
    entered: (n: number) => `${String(n)} digits entered`,
    booked: (t: string) => `The room is booked until ${t}`,
    ended: 'The meeting has ended. The room is free.',
    errors: {
      WRONG_PIN: 'The PIN is not correct. Try again.',
      RATE_LIMITED: 'Too many attempts. Try again in a few minutes.',
      ROOM_BUSY: 'The room is already booked at that time.',
      BOOKING_DISABLED: 'Booking at this screen is not available.',
      NOT_FOUND: 'Booking at this screen is not available.',
      other: 'Cannot reach the server. Try again.',
    },
    unavailable: 'The room is not available',
  },
} as const;

type Text = (typeof TEXT)[keyof typeof TEXT];

const SVG_NS = 'http://www.w3.org/2000/svg';
/** A check mark (free) or a "no entry" sign (busy): the state is never shown by color alone. */
function stateIcon(busy: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'w-room-icon');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10.5');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  const mark = document.createElementNS(SVG_NS, 'path');
  mark.setAttribute('d', busy ? 'M7 12h10' : 'M7 12.5l3.2 3.2L17 9');
  mark.setAttribute('fill', 'none');
  mark.setAttribute('stroke', 'currentColor');
  mark.setAttribute('stroke-width', '2.6');
  mark.setAttribute('stroke-linecap', 'round');
  mark.setAttribute('stroke-linejoin', 'round');
  svg.append(circle, mark);
  return svg;
}

interface Meeting {
  start: number;
  end: number;
  title: string | null;
  screenBookingId: string | null;
}

const toMeeting = (m: RoomStatusMeeting): Meeting => ({
  start: Date.parse(m.startsAt),
  end: Date.parse(m.endsAt),
  title: m.title,
  screenBookingId: m.screenBookingId,
});

/** The current meeting, when the room is busy until (back-to-back meetings joined), and the next. */
export function roomState(meetings: Meeting[], now: number) {
  const sorted = meetings.filter((m) => m.end > now).sort((a, b) => a.start - b.start);
  const current = sorted.find((m) => m.start <= now) ?? null;
  let busyUntil = current?.end ?? null;
  if (busyUntil !== null) {
    for (const m of sorted) {
      if (m.start <= busyUntil && m.end > busyUntil) busyUntil = m.end;
    }
  }
  const upcoming = sorted.filter((m) => m !== current && m.start > now);
  const next = upcoming[0] ?? null;
  return { current, busyUntil, next, upcoming };
}

/**
 * A meeting room's screen: free or busy (in words, an icon and a color), until when, the
 * next meetings, and on touch screens "Book now" with the organization's PIN.
 */
export const roomWidget = defineWidget<RoomConfig>({
  type: 'room',
  parseConfig: (config) => roomConfigSchema.parse(config),
  render(container, config, ctx) {
    const t: Text = TEXT[config.locale];
    const locale = config.locale === 'he' ? 'he-IL' : 'en-US';
    let timeFormat: Intl.DateTimeFormat;
    try {
      timeFormat = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: ctx.timezone,
        ...(config.format === '24h' ? hour23() : { hour12: true }),
      });
    } catch {
      timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    }
    const time = (ms: number) => timeFormat.format(new Date(ms)).replace(/^24(?=\D)/, '00');

    const name = el('h2', { className: 'w-room-name', dir: 'auto' });
    const place = el('p', { className: 'w-room-place', dir: 'auto' });
    const clock = el('div', { className: 'w-room-clock', dir: 'ltr' });
    const head = el(
      'div',
      { className: 'w-room-head' },
      el('div', { className: 'w-room-names' }, name, place),
      clock,
    );
    const stateWord = el('p', { className: 'w-room-state' });
    const until = el('p', { className: 'w-room-until' });
    const title = el('p', { className: 'w-room-title', dir: 'auto' });
    const iconSlot = el('div', { className: 'w-room-icon-slot' });
    const status = el(
      'div',
      { className: 'w-room-status' },
      iconSlot,
      el('div', { className: 'w-room-words' }, stateWord, until, title),
    );
    const actions = el('div', { className: 'w-room-actions' });
    // Announced to screen readers: the result of a booking, and changes of state.
    const notice = el('p', { className: 'w-room-notice' });
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    const nextTitle = el('h3', { className: 'w-room-next-title', text: t.next });
    const nextList = el('ul', { className: 'w-room-next-list' });
    const nextBox = el('div', { className: 'w-room-next' }, nextTitle, nextList);
    const main = el('div', { className: 'w-room-main' }, status, actions, notice);
    const body = el('div', { className: 'w-room-body' }, main, nextBox);
    const root = el('div', { className: 'w-room w-room--free' }, head, body);
    root.lang = config.locale;
    root.dir = config.locale === 'he' ? 'rtl' : 'ltr';
    container.append(root);

    let data: RoomStatusData | null = null;
    let meetings: Meeting[] = [];
    let busy = false;
    let lastStateKey = '';

    // ---------------------------------------------------------------- PIN pad
    const pinTitle = el('h3', { className: 'w-room-pin-title' });
    pinTitle.id = `w-room-pin-${String(++padCount)}`;
    const pinAction = el('p', { className: 'w-room-pin-action' });
    const dots = el('div', { className: 'w-room-pin-dots' });
    dots.setAttribute('aria-live', 'polite');
    const pinError = el('p', { className: 'w-room-pin-error' });
    pinError.setAttribute('role', 'alert');
    const keys = el('div', { className: 'w-room-pin-keys' });
    const pad = el(
      'div',
      { className: 'w-room-pin' },
      el('div', { className: 'w-room-pin-box' }, pinTitle, pinAction, dots, pinError, keys),
    );
    pad.hidden = true;
    pad.setAttribute('role', 'dialog');
    pad.setAttribute('aria-modal', 'true');
    pad.setAttribute('aria-labelledby', pinTitle.id);
    root.append(pad);
    pinTitle.textContent = t.pinTitle;

    let pin = '';
    let pending: ((pin: string) => Promise<void>) | null = null;
    let opener: HTMLElement | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let submitting = false;

    const showDots = () => {
      dots.replaceChildren(
        ...Array.from({ length: Math.max(pin.length, 4) }, (_, i) =>
          el('span', { className: i < pin.length ? 'on' : '' }),
        ),
      );
      dots.setAttribute('aria-label', t.entered(pin.length));
    };
    const closePad = () => {
      clearTimeout(idleTimer);
      pad.hidden = true;
      pin = '';
      pending = null;
      pinError.textContent = '';
      opener?.focus();
      opener = null;
    };
    const touchPad = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(closePad, PIN_IDLE_MS);
    };
    const press = (key: string) => {
      if (submitting) return;
      touchPad();
      pinError.textContent = '';
      if (key === 'erase') pin = pin.slice(0, -1);
      else if (key === 'ok') void submit();
      else if (pin.length < 8) pin += key;
      showDots();
    };
    const submit = async () => {
      if (!pending || pin.length < 4) return;
      submitting = true;
      const action = pending;
      try {
        await action(pin);
      } finally {
        submitting = false;
      }
    };
    const keyButton = (label: string, key: string, aria: string, className = '') => {
      const button = el('button', { className: `w-room-key ${className}`, text: label });
      button.type = 'button';
      button.setAttribute('aria-label', aria);
      button.addEventListener('click', () => {
        press(key);
      });
      return button;
    };
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      keys.append(keyButton(digit, digit, t.digit(digit)));
    }
    keys.append(
      keyButton('⌫', 'erase', t.erase, 'w-room-key-erase'),
      keyButton('0', '0', t.digit('0')),
      keyButton('✓', 'ok', t.confirm, 'w-room-key-ok'),
    );
    const cancel = el('button', { className: 'w-room-pin-cancel', text: t.cancel });
    cancel.type = 'button';
    cancel.addEventListener('click', closePad);
    keys.after(cancel);
    pad.addEventListener('keydown', (event) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') press('erase');
      else if (event.key === 'Enter' && event.target === pad) press('ok');
      else if (event.key === 'Escape') closePad();
      else return;
      event.preventDefault();
    });

    const openPad = (label: string, from: HTMLElement, action: (pin: string) => Promise<void>) => {
      opener = from;
      pending = action;
      pin = '';
      pinAction.textContent = label;
      pinError.textContent = '';
      showDots();
      pad.hidden = false;
      pad.tabIndex = -1;
      touchPad();
      (keys.querySelector('button') ?? pad).focus();
    };

    const errorText = (code: string) =>
      (t.errors as Record<string, string>)[code] ?? t.errors.other;

    // --------------------------------------------------------------- showing
    const render = () => {
      if (!data) return;
      const now = ctx.now().getTime();
      const state = roomState(meetings, now);
      busy = state.current !== null;
      root.classList.toggle('w-room--busy', busy);
      root.classList.toggle('w-room--free', !busy);
      name.textContent = data.room.name;
      const where = [
        data.room.location ?? '',
        data.room.capacity ? t.seats(data.room.capacity) : '',
      ].filter(Boolean);
      place.textContent = where.join(' · ');
      place.hidden = where.length === 0;
      clock.textContent = time(now);

      stateWord.textContent = busy ? t.busy : t.free;
      iconSlot.replaceChildren(stateIcon(busy));
      if (busy && state.busyUntil !== null) until.textContent = t.busyUntil(time(state.busyUntil));
      else if (state.next) until.textContent = t.freeUntil(time(state.next.start));
      else until.textContent = t.freeAllDay;
      title.textContent = busy ? (state.current?.title ?? '') : '';
      title.hidden = title.textContent === '';

      const stateKey = `${String(busy)}:${until.textContent}:${String(data.bookingEnabled)}`;
      if (stateKey !== lastStateKey) {
        lastStateKey = stateKey;
        renderActions(state, now);
      }

      nextList.replaceChildren(
        ...(state.upcoming.length === 0
          ? [el('li', { className: 'w-room-next-none', text: t.nothingNext })]
          : state.upcoming.slice(0, 4).map((m) =>
              el(
                'li',
                {},
                el('span', {
                  className: 'w-room-next-time',
                  dir: 'ltr',
                  text: `${time(m.start)}–${time(m.end)}`,
                }),
                el('span', {
                  className: 'w-room-next-what',
                  dir: 'auto',
                  text: m.title ?? t.meeting,
                }),
              ),
            )),
      );
    };

    const renderActions = (state: ReturnType<typeof roomState>, now: number) => {
      actions.replaceChildren();
      if (!data?.bookingEnabled) return;
      if (!busy) {
        const label = el('p', { className: 'w-room-actions-label', text: t.bookNow });
        const row = el('div', { className: 'w-room-book' });
        for (const minutes of MINUTES) {
          const button = el('button', { className: 'w-room-button', text: t.minutes(minutes) });
          button.type = 'button';
          button.setAttribute('aria-label', t.minutesLong(minutes));
          // Not past the start of the next meeting.
          button.disabled = state.next !== null && now + minutes * 60_000 > state.next.start;
          button.addEventListener('click', () => {
            openPad(t.pinBook(minutes), button, async (entered) => {
              const result = await roomHost.book(config.roomId, minutes, entered);
              if (result.ok) {
                closePad();
                notice.textContent = t.booked(time(Date.now() + minutes * 60_000));
                void load();
              } else {
                pin = '';
                showDots();
                pinError.textContent = errorText(result.code);
                if (result.code === 'ROOM_BUSY') void load();
              }
            });
          });
          row.append(button);
        }
        actions.append(label, row);
      } else if (state.current?.screenBookingId) {
        const bookingId = state.current.screenBookingId;
        const button = el('button', { className: 'w-room-button w-room-end', text: t.endNow });
        button.type = 'button';
        button.addEventListener('click', () => {
          openPad(t.pinEnd, button, async (entered) => {
            const result = await roomHost.end(config.roomId, bookingId, entered);
            if (result.ok) {
              closePad();
              notice.textContent = t.ended;
              void load();
            } else {
              pin = '';
              showDots();
              pinError.textContent = errorText(result.code);
            }
          });
        });
        actions.append(button);
      }
    };

    const load = async () => {
      try {
        const fresh = await ctx.fetchData<RoomStatusData>();
        if (ctx.signal.aborted) return;
        data = fresh;
        meetings = [fresh.current, ...fresh.upcoming]
          .filter((m): m is RoomStatusMeeting => m !== null)
          .map(toMeeting);
        lastStateKey = '';
        root.classList.remove('w-room--unavailable');
        render();
      } catch {
        // Offline with no copy yet, or the room was deleted: say so only if nothing is shown.
        if (!data) {
          root.classList.add('w-room--unavailable');
          stateWord.textContent = t.unavailable;
        }
      }
    };

    void load();
    every(TICK_MS, ctx.signal, render);
    every(REFRESH_MS, ctx.signal, () => void load());
    roomHost.onChange(config.roomId, ctx.signal, () => void load());
    return {
      destroy: () => {
        clearTimeout(idleTimer);
        root.remove();
      },
    };
  },
});
