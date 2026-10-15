import QRCode from 'qrcode';
import { qrConfigSchema, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el } from '@rubinny/widget-sdk';

/** QR code generated on the screen itself (no external service). */
export const qrWidget = defineWidget<WidgetConfig<'qr'>>({
  type: 'qr',
  parseConfig: (config) => qrConfigSchema.parse(config),
  render(container, config, ctx) {
    const image = el('img', { className: 'w-qr-code' });
    image.alt = config.label ?? config.url;
    const root = el(
      'figure',
      { className: 'w-qr', style: { background: config.background } },
      image,
    );
    if (config.label) {
      root.append(
        el('figcaption', { text: config.label, dir: 'auto', style: { color: config.foreground } }),
      );
    }
    container.append(root);
    void QRCode.toString(config.url, {
      type: 'svg',
      margin: 2,
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
