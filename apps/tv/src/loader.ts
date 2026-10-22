// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { parseServer, playerUrl } from './address';
import type { ServerStore } from './storage';

/**
 * The loader page of the TV apps (docs/phases/14-tizen-webos.md). First start: asks for the
 * server address. Later starts: opens that server's web player after a short countdown that
 * any key stops, with a way to change the server. Runs no code from the server: it only
 * navigates there. Usable with a TV remote (arrow keys, OK, Back) and a screen reader.
 */

export interface LoaderOptions {
  store: ServerStore;
  navigate: (url: string) => void;
  /** Seconds before the saved server opens on its own. */
  countdownSeconds?: number;
  setTimer?: (callback: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

/** Back on the remote (Tizen and webOS report it by key code only), or Escape on a keyboard. */
const BACK_KEYS = new Set([10009, 461]);
const isBack = (event: KeyboardEvent) =>
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- TV remotes need keyCode.
  BACK_KEYS.has(event.keyCode) || event.key === 'Escape';

const seconds = (n: number): [string, string] => [
  `הנגן ייפתח בעוד ${n === 1 ? 'שנייה' : `${String(n)} שניות`}`,
  `Opening in ${String(n)} ${n === 1 ? 'second' : 'seconds'}`,
];

/** Hebrew, then English isolated in its own direction (the page is right to left). */
function bilingual(target: HTMLElement, [he, en]: [string, string]) {
  const english = target.ownerDocument.createElement('span');
  english.lang = 'en';
  english.dir = 'ltr';
  english.textContent = en;
  target.textContent = `${he} · `;
  target.append(english);
}

function element(doc: Document, id: string): HTMLElement {
  const found = doc.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found;
}

export function startLoader(doc: Document, options: LoaderOptions) {
  const setTimer = options.setTimer ?? ((callback, ms) => window.setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((id) => {
      window.clearTimeout(id);
    });
  const total = options.countdownSeconds ?? 10;

  const starting = element(doc, 'starting');
  const serverText = element(doc, 'starting-server');
  const countdown = element(doc, 'countdown');
  const startNow = element(doc, 'start-now');
  const change = element(doc, 'change');
  const form = element(doc, 'setup') as HTMLFormElement;
  const input = element(doc, 'server') as HTMLInputElement;
  const error = element(doc, 'error');

  let timer: number | null = null;
  let left = total;

  const stopCountdown = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
    bilingual(countdown, ['הספירה נעצרה', 'Countdown stopped']);
  };

  const open = (origin: string) => {
    stopCountdown();
    options.navigate(playerUrl(origin));
  };

  const tick = (origin: string) => {
    timer = setTimer(() => {
      left -= 1;
      if (left <= 0) {
        timer = null;
        open(origin);
        return;
      }
      bilingual(countdown, seconds(left));
      tick(origin);
    }, 1000);
  };

  const showStarting = (origin: string, count: boolean) => {
    form.hidden = true;
    starting.hidden = false;
    serverText.textContent = origin;
    if (count) {
      left = total;
      bilingual(countdown, seconds(left));
      tick(origin);
    } else {
      countdown.textContent = '';
    }
    startNow.focus();
  };

  const showSetup = (value: string | null) => {
    stopCountdown();
    starting.hidden = true;
    form.hidden = false;
    input.value = value ?? '';
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    input.focus();
  };

  startNow.addEventListener('click', () => {
    const origin = options.store.read();
    if (origin) open(origin);
  });
  change.addEventListener('click', () => {
    showSetup(options.store.read());
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const origin = parseServer(input.value);
    if (!origin) {
      input.setAttribute('aria-invalid', 'true');
      bilingual(error, [
        'כתובת לא תקינה. יש להזין כתובת https מלאה, למשל https://signage.example.com',
        'Invalid address: enter a full https address, for example https://signage.example.com',
      ]);
      input.focus();
      return;
    }
    // A device that cannot store it still opens the player now; it asks again next time.
    options.store.write(origin);
    open(origin);
  });

  /** Arrow keys move between the controls (TV browsers have no spatial navigation of their own). */
  const move = (step: 1 | -1) => {
    const controls = Array.from(doc.querySelectorAll<HTMLElement>('button, input')).filter(
      (control) => !control.closest('[hidden]'),
    );
    if (controls.length === 0) return;
    const index = controls.indexOf(doc.activeElement as HTMLElement);
    const next = controls[(index + step + controls.length) % controls.length];
    next?.focus();
  };

  doc.addEventListener('keydown', (event) => {
    stopCountdown();
    const inField = doc.activeElement === input;
    const rtl = doc.documentElement.dir === 'rtl';
    if (
      event.key === 'ArrowDown' ||
      (!inField && event.key === (rtl ? 'ArrowLeft' : 'ArrowRight'))
    ) {
      event.preventDefault();
      move(1);
    } else if (
      event.key === 'ArrowUp' ||
      (!inField && event.key === (rtl ? 'ArrowRight' : 'ArrowLeft'))
    ) {
      event.preventDefault();
      move(-1);
    } else if (isBack(event)) {
      // From the form back to the saved server; elsewhere Back is left to the TV (leaves the app).
      const saved = parseServer(options.store.read() ?? '');
      if (!form.hidden && saved) {
        event.preventDefault();
        showStarting(saved, false);
      }
    }
  });
  doc.addEventListener('pointerdown', stopCountdown);

  const saved = options.store.read();
  const origin = saved === null ? null : parseServer(saved);
  if (origin) showStarting(origin, true);
  else showSetup(null);
}
