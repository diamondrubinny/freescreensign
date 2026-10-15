import {
  countdownConfigSchema,
  splitDuration,
  zonedDateTime,
  type WidgetConfig,
} from '@rubinny/shared';
import { defineWidget, el, every, textDirection } from '@rubinny/widget-sdk';
import { applyColors } from './theme';

const UNITS = {
  he: { days: 'ימים', hours: 'שעות', minutes: 'דקות', seconds: 'שניות' },
  en: { days: 'days', hours: 'hours', minutes: 'minutes', seconds: 'seconds' },
} as const;

/** Counts down to a date and time in the screen's (or a chosen) time zone. */
export const countdownWidget = defineWidget<WidgetConfig<'countdown'>>({
  type: 'countdown',
  parseConfig: (config) => countdownConfigSchema.parse(config),
  render(container, config, ctx) {
    const timeZone = config.timezone ?? ctx.timezone;
    let target: number;
    try {
      target = zonedDateTime(config.target, timeZone).getTime();
    } catch {
      target = Number.NaN;
    }
    const labels = UNITS[config.locale];
    const keys = (['days', 'hours', 'minutes', 'seconds'] as const).filter(
      (key) => key !== 'seconds' || config.showSeconds,
    );
    const values = new Map<string, HTMLElement>();
    const units = el(
      'div',
      { className: 'w-countdown-units', dir: config.locale === 'he' ? 'rtl' : 'ltr' },
      ...keys.map((key) => {
        const value = el('span', { className: 'w-countdown-value', text: '0' });
        values.set(key, value);
        return el(
          'div',
          { className: 'w-countdown-unit' },
          value,
          el('span', { className: 'w-countdown-label', text: labels[key] }),
        );
      }),
    );
    const done = el('div', { className: 'w-countdown-done', dir: 'auto' });
    const root = el(
      'div',
      { className: 'w-countdown w-surface' },
      el('div', {
        className: 'w-countdown-title',
        text: config.title,
        dir: textDirection(config.title),
      }),
      units,
    );
    root.lang = config.locale;
    applyColors(root, { text: config.textColor, background: config.background });
    container.append(root);

    const update = () => {
      const remaining = target - ctx.now().getTime();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        if (!done.isConnected) {
          units.replaceWith(done);
          done.textContent = config.doneText ?? '';
        }
        return;
      }
      const parts = splitDuration(remaining);
      for (const key of keys) {
        const text = key === 'days' ? String(parts.days) : String(parts[key]).padStart(2, '0');
        const node = values.get(key);
        if (node && node.textContent !== text) node.textContent = text;
      }
    };
    update();
    every(1000, ctx.signal, update);
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
