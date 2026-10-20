import { clockConfigSchema, formatHebrewDate, hour23, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';
import { applyColors } from './theme';

type ClockConfig = WidgetConfig<'clock'>;

function formatters(config: ClockConfig, timeZone: string) {
  const locale = config.locale === 'he' ? 'he-IL' : 'en-US';
  const safe = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone });
    } catch {
      return new Intl.DateTimeFormat(locale, options);
    }
  };
  return {
    time: safe({
      hour: '2-digit',
      minute: '2-digit',
      ...(config.showSeconds ? { second: '2-digit' } : {}),
      ...(config.format === '24h' ? hour23() : { hour12: true }),
    }),
    date: safe({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    timeZone,
  };
}

/** Time, Gregorian date and (optionally) the Hebrew date, in the screen's time zone. */
export const clockWidget = defineWidget<ClockConfig>({
  type: 'clock',
  parseConfig: (config) => clockConfigSchema.parse(config),
  render(container, config, ctx) {
    const timeZone = config.timezone ?? ctx.timezone;
    const format = formatters(config, timeZone);
    const time = el('div', { className: 'w-clock-time', dir: 'ltr' });
    const date = el('div', { className: 'w-clock-date', dir: 'auto' });
    const hebrew = el('div', { className: 'w-clock-hebrew', dir: 'rtl', text: '' });
    hebrew.lang = 'he';
    const root = el('div', { className: 'w-clock w-surface' }, time);
    applyColors(root, { text: config.textColor, background: config.background });
    root.lang = config.locale;
    if (config.showDate || config.showHebrewDate) {
      root.append(el('div', { className: 'w-divider' }));
    }
    if (config.showDate) root.append(date);
    if (config.showHebrewDate) root.append(hebrew);
    container.append(root);

    let lastDay = '';
    const update = () => {
      const now = ctx.now();
      // Older engines may print 24:05 for 00:05 (see hour23).
      time.textContent = format.time.format(now).replace(/^24(?=\D)/, '00');
      const day = format.date.format(now);
      if (day !== lastDay) {
        lastDay = day;
        date.textContent = day;
        try {
          hebrew.textContent = formatHebrewDate(now, timeZone);
        } catch {
          hebrew.textContent = '';
        }
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
