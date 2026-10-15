import { textConfigSchema, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, textDirection } from '@rubinny/widget-sdk';
import { fitText, onLayout } from './fit';

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
    const root = el(
      'div',
      {
        className: `w-text w-align-${config.align}`,
        style: { color: config.textColor, background: config.background },
      },
      text,
    );
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
