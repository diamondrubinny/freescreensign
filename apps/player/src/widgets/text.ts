// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { textConfigSchema, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, textDirection } from '@rubinny/widget-sdk';
import { fitText, onLayout } from './fit';
import { applyColors } from './theme';

/** Static text, auto-shrunk to fit the zone. Direction follows the text (RTL/LTR). */
export const textWidget = defineWidget<WidgetConfig<'text'>>({
  type: 'text',
  parseConfig: (config) => textConfigSchema.parse(config),
  render(container, config, ctx) {
    const text = el('p', {
      className: `w-text-body w-size-${config.size}`,
      text: config.text,
      dir: textDirection(config.text),
    });
    const content = el('div', { className: 'w-text-content' });
    if (config.title) {
      content.append(
        el('h2', {
          className: 'w-text-title',
          text: config.title,
          dir: textDirection(config.title),
        }),
      );
    }
    content.append(text);
    const root = el('div', { className: `w-text w-surface w-align-${config.align}` }, content);
    applyColors(root, { text: config.textColor, background: config.background });
    container.append(root);
    onLayout(ctx.signal, () => {
      fitText(text, root);
    });
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
