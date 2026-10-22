// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { webpageConfigSchema, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, every } from '@rubinny/widget-sdk';

/**
 * Shows an external web page in a sandboxed frame. Pages from the player's own
 * origin are refused: they could read the device token. (The server refuses
 * them too; this is defense in depth.) Sites that forbid framing stay blank.
 */
export const webpageWidget = defineWidget<WidgetConfig<'webpage'>>({
  type: 'webpage',
  parseConfig: (config) => webpageConfigSchema.parse(config),
  render(container, config, ctx) {
    const url = new URL(config.url);
    if (url.origin === location.origin || url.protocol !== 'https:') {
      return { destroy: () => undefined };
    }
    const frame = document.createElement('iframe');
    frame.className = 'w-webpage';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('allow', '');
    frame.referrerPolicy = 'no-referrer';
    frame.title = url.hostname;
    frame.tabIndex = -1;
    frame.src = url.toString();
    container.append(frame);
    if (config.refreshMinutes > 0) {
      every(config.refreshMinutes * 60_000, ctx.signal, () => {
        frame.src = url.toString();
      });
    }
    return {
      destroy: () => {
        frame.remove();
      },
    };
  },
});
