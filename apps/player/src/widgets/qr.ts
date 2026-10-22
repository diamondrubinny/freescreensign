// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import QRCode from 'qrcode';
import { qrConfigSchema, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el } from '@rubinny/widget-sdk';
import { applyColors } from './theme';

/** QR code generated on the screen itself (no external service). */
export const qrWidget = defineWidget<WidgetConfig<'qr'>>({
  type: 'qr',
  parseConfig: (config) => qrConfigSchema.parse(config),
  render(container, config, ctx) {
    const image = el('img', { className: 'w-qr-code' });
    image.alt = config.label ?? config.url;
    const frame = el('div', { className: 'w-qr-frame' }, image);
    frame.style.background = config.background;
    const root = el('figure', { className: 'w-qr w-surface' }, frame);
    // The zone around the code uses a darker shade of the code's colors.
    applyColors(root, { text: '#ffffff', background: config.foreground });
    if (config.label) root.append(el('figcaption', { text: config.label, dir: 'auto' }));
    container.append(root);
    void QRCode.toString(config.url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: config.foreground, light: config.background },
    })
      .then((svg) => {
        if (!ctx.signal.aborted) {
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }
      })
      .catch(() => undefined);
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
