// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * Applies a widget's colors. The flat color always works; browsers that support
 * color-mix() add a subtle gradient (see player.css).
 */
export function applyColors(element: HTMLElement, colors: { text: string; background: string }) {
  element.style.color = colors.text;
  element.style.backgroundColor = colors.background;
  element.style.setProperty('--w-bg', colors.background);
  element.style.setProperty('--w-fg', colors.text);
}
