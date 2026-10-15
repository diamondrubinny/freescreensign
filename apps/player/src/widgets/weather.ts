import { weatherConfigSchema, type WeatherData, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';

const REFRESH_MS = 15 * 60 * 1000;

type Condition = { icon: string; he: string; en: string };

/** WMO weather interpretation codes, as used by Open-Meteo. */
export function weatherCondition(code: number): Condition {
  if (code === 0) return { icon: '☀', he: 'בהיר', en: 'Clear' };
  if (code <= 2) return { icon: '⛅', he: 'מעונן חלקית', en: 'Partly cloudy' };
  if (code === 3) return { icon: '☁', he: 'מעונן', en: 'Overcast' };
  if (code === 45 || code === 48) return { icon: '🌫', he: 'ערפל', en: 'Fog' };
  if (code >= 51 && code <= 57) return { icon: '🌦', he: 'טפטוף', en: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { icon: '🌧', he: 'גשם', en: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: '❄', he: 'שלג', en: 'Snow' };
  if (code >= 95) return { icon: '⛈', he: 'סופת רעמים', en: 'Thunderstorm' };
  return { icon: '•', he: '', en: '' };
}

/** Current conditions and a short forecast, from data fetched by the Rubinny server. */
export const weatherWidget = defineWidget<WidgetConfig<'weather'>>({
  type: 'weather',
  parseConfig: (config) => weatherConfigSchema.parse(config),
  render(container, config, ctx) {
    const locale = config.locale === 'he' ? 'he-IL' : 'en-US';
    const unit = config.units === 'imperial' ? '°F' : '°C';
    const root = el('div', {
      className: 'w-weather',
      dir: config.locale === 'he' ? 'rtl' : 'ltr',
      style: { color: config.textColor, background: config.background },
    });
    root.lang = config.locale;
    container.append(root);

    const dayName = (date: string) => {
      try {
        return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
          new Date(`${date}T12:00:00Z`),
        );
      } catch {
        return date;
      }
    };

    const draw = (data: WeatherData) => {
      const current = weatherCondition(data.current.weatherCode);
      const now = el(
        'div',
        { className: 'w-weather-now' },
        el('span', { className: 'w-weather-icon', text: current.icon }),
        el('span', {
          className: 'w-weather-temp',
          dir: 'ltr',
          text: `${String(data.current.temperature)}${unit}`,
        }),
      );
      const header = el(
        'div',
        { className: 'w-weather-header' },
        el('div', { className: 'w-weather-place', text: config.locationName, dir: 'auto' }),
        el('div', { className: 'w-weather-desc', text: current[config.locale] }),
      );
      const days = el(
        'ol',
        { className: 'w-weather-days' },
        ...data.daily.map((day) =>
          el(
            'li',
            {},
            el('span', { text: dayName(day.date) }),
            el('span', { text: weatherCondition(day.weatherCode).icon }),
            el('span', {
              dir: 'ltr',
              text: `${String(day.max)}° / ${String(day.min)}°`,
            }),
          ),
        ),
      );
      const credit = el('div', {
        className: 'w-weather-credit',
        dir: 'ltr',
        text: data.attribution,
      });
      root.replaceChildren(header, now, ...(data.daily.length > 0 ? [days] : []), credit);
    };

    const load = async () => {
      try {
        const data = await ctx.fetchData<WeatherData>();
        if (!ctx.signal.aborted) draw(data);
      } catch {
        // Keep the last drawing (or nothing) while offline.
      }
    };
    void load();
    every(REFRESH_MS, ctx.signal, () => void load());
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
