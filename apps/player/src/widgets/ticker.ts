import { tickerConfigSchema, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, textDirection } from '@rubinny/widget-sdk';
import { onLayout } from './fit';

/** Scroll speed in zone heights per second (so it looks the same on any screen). */
const SPEED = { slow: 1.2, normal: 2, fast: 3.2 } as const;

/**
 * A scrolling text line. Hebrew/Arabic text enters from the left and moves right,
 * Latin text the other way. With reduced motion the text is shown statically.
 */
export const tickerWidget = defineWidget<WidgetConfig<'ticker'>>({
  type: 'ticker',
  parseConfig: (config) => tickerConfigSchema.parse(config),
  render(container, config, ctx) {
    const dir = textDirection(config.text);
    const track = el('span', { className: 'w-ticker-text', text: config.text, dir });
    const root = el(
      'div',
      {
        className: `w-ticker${ctx.reducedMotion ? ' w-ticker-static' : ''}`,
        dir,
        style: { color: config.textColor, background: config.background },
      },
      track,
    );
    container.append(root);

    let animation: Animation | null = null;
    const start = () => {
      animation?.cancel();
      animation = null;
      if (ctx.reducedMotion || typeof track.animate !== 'function') return;
      const boxWidth = root.clientWidth;
      const textWidth = track.scrollWidth;
      const pxPerSecond = Math.max(root.clientHeight, 1) * SPEED[config.speed];
      const distance = boxWidth + textWidth;
      if (distance <= 0) return;
      // The text starts just outside one edge and ends just outside the other.
      const [from, to] = dir === 'rtl' ? [-textWidth, boxWidth] : [boxWidth, -textWidth];
      animation = track.animate(
        [
          { transform: `translateX(${String(from)}px)` },
          { transform: `translateX(${String(to)}px)` },
        ],
        { duration: (distance / pxPerSecond) * 1000, iterations: Infinity, easing: 'linear' },
      );
    };
    onLayout(ctx.signal, start);
    return {
      destroy() {
        animation?.cancel();
        root.remove();
      },
    };
  },
});
