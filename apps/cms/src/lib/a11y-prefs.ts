// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { readPreference, writePreference } from './storage';

export interface A11yPrefs {
  /** Root font scale in percent: 100–200. */
  fontScale: number;
  contrast: boolean;
  underlineLinks: boolean;
  readableFont: boolean;
  stopAnimations: boolean;
}

export const DEFAULT_A11Y: A11yPrefs = {
  fontScale: 100,
  contrast: false,
  underlineLinks: false,
  readableFont: false,
  stopAnimations: false,
};

const KEY = 'rubinny.a11y';

export function loadA11yPrefs(): A11yPrefs {
  const raw = readPreference(KEY);
  if (!raw) return DEFAULT_A11Y;
  try {
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>;
    const scale = Number(parsed.fontScale);
    return {
      fontScale: Number.isFinite(scale) ? Math.min(200, Math.max(100, scale)) : 100,
      contrast: parsed.contrast === true,
      underlineLinks: parsed.underlineLinks === true,
      readableFont: parsed.readableFont === true,
      stopAnimations: parsed.stopAnimations === true,
    };
  } catch {
    return DEFAULT_A11Y;
  }
}

export function saveA11yPrefs(prefs: A11yPrefs): void {
  writePreference(KEY, JSON.stringify(prefs));
}

/** Applies preferences as classes / font size on <html>; styles live in styles/app.css. */
export function applyA11yPrefs(
  prefs: A11yPrefs,
  root: HTMLElement = document.documentElement,
): void {
  root.style.fontSize = `${prefs.fontScale}%`;
  root.classList.toggle('a11y-contrast', prefs.contrast);
  root.classList.toggle('a11y-underline-links', prefs.underlineLinks);
  root.classList.toggle('a11y-readable-font', prefs.readableFont);
  root.classList.toggle('a11y-stop-animations', prefs.stopAnimations);
}
