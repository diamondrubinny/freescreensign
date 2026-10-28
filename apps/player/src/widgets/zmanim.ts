// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  hour23,
  zmanimConfigSchema,
  type WidgetConfig,
  type ZmanimData,
  type ZmanimDay,
  type ZmanKey,
} from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';
import { applyColors } from './theme';

type ZmanimConfig = WidgetConfig<'zmanim'>;

const REFRESH_MS = 60 * 60 * 1000;
const TICK_MS = 30 * 1000;

const LABELS: Record<'he' | 'en', Record<ZmanKey, string>> = {
  he: {
    alotHaShachar: 'עלות השחר',
    misheyakir: 'משיכיר',
    sunrise: 'הנץ החמה',
    sofZmanShmaMGA: 'סוף זמן ק״ש (מג״א)',
    sofZmanShma: 'סוף זמן ק״ש (גר״א)',
    sofZmanTfilla: 'סוף זמן תפילה (גר״א)',
    chatzot: 'חצות היום',
    minchaGedola: 'מנחה גדולה',
    minchaKetana: 'מנחה קטנה',
    plagHaMincha: 'פלג המנחה',
    sunset: 'שקיעה',
    tzeit: 'צאת הכוכבים',
  },
  en: {
    alotHaShachar: 'Dawn (Alot HaShachar)',
    misheyakir: 'Misheyakir',
    sunrise: 'Sunrise',
    sofZmanShmaMGA: 'Latest Shema (MGA)',
    sofZmanShma: 'Latest Shema (GRA)',
    sofZmanTfilla: 'Latest Shacharit (GRA)',
    chatzot: 'Midday (Chatzot)',
    minchaGedola: 'Earliest Mincha',
    minchaKetana: 'Mincha Ketana',
    plagHaMincha: 'Plag HaMincha',
    sunset: 'Sunset',
    tzeit: 'Nightfall (Tzeit)',
  },
};

const TEXT = {
  he: {
    times: 'זמני היום',
    prayers: 'זמני תפילות',
    candles: 'הדלקת נרות',
    havdalah: 'צאת השבת / החג',
    method: (minutes: number, havdalah: string) =>
      `הדלקת נרות ${String(minutes)} דקות לפני השקיעה · ${
        havdalah === 'tzeit'
          ? 'צאת השבת: צאת הכוכבים (8.5°)'
          : `צאת השבת: ${havdalah} דקות אחרי השקיעה`
      }`,
    waiting: 'הזמנים ייטענו בקרוב',
  },
  en: {
    times: 'Times of the day',
    prayers: 'Prayers',
    candles: 'Candle lighting',
    havdalah: 'Havdalah',
    method: (minutes: number, havdalah: string) =>
      `Candles ${String(minutes)} minutes before sunset · ${
        havdalah === 'tzeit'
          ? 'havdalah at nightfall (8.5°)'
          : `havdalah ${havdalah} minutes after sunset`
      }`,
    waiting: 'The times will load soon',
  },
} as const;

function safeFormat(locale: string, options: Intl.DateTimeFormatOptions, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, options);
  }
}

/** The day to show: today in the place's time zone (or the nearest day the data covers). */
export function zmanimToday(data: ZmanimData, now: Date): ZmanimDay | null {
  const key = safeFormat(
    'en-CA',
    { year: 'numeric', month: '2-digit', day: '2-digit' },
    data.place.timezone,
  ).format(now);
  const found = data.days.filter((day) => day.date <= key);
  return found[found.length - 1] ?? data.days[0] ?? null;
}

/**
 * Synagogue times (computed by the Rubinny server for two weeks ahead, so the screen keeps
 * them offline): the Hebrew date and the week's Torah portion, times of the day, prayer
 * times with the next one marked, and the coming candle lighting and havdalah.
 */
export const zmanimWidget = defineWidget<ZmanimConfig>({
  type: 'zmanim',
  parseConfig: (config) => zmanimConfigSchema.parse(config),
  render(container, config, ctx) {
    const t = TEXT[config.locale];
    const labels = LABELS[config.locale];
    const locale = config.locale === 'he' ? 'he-IL' : 'en-US';
    const zone = config.place.timezone;
    const timeFormat = safeFormat(
      locale,
      {
        hour: '2-digit',
        minute: '2-digit',
        ...(config.format === '24h' ? hour23() : { hour12: true }),
      },
      zone,
    );
    const weekday = safeFormat(locale, { weekday: 'long' }, zone);
    // A day's key ("2026-11-06") is a civil date: format its noon in UTC, whatever the zone.
    const keyWeekday = safeFormat(locale, { weekday: 'long' }, 'UTC');
    const keyDate = safeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }, 'UTC');
    const time = (iso: string) => timeFormat.format(new Date(iso)).replace(/^24(?=\D)/, '00');

    const heading = el('h2', { className: 'w-zm-title', dir: 'auto' });
    const dates = el('p', { className: 'w-zm-dates' });
    const special = el('p', { className: 'w-zm-special', dir: 'auto' });
    const columns = el('div', { className: 'w-zm-columns' });
    const shabbat = el('div', { className: 'w-zm-shabbat' });
    const method = el('p', { className: 'w-zm-method' });
    const root = el(
      'div',
      { className: 'w-zm w-surface' },
      heading,
      dates,
      special,
      columns,
      shabbat,
      method,
    );
    applyColors(root, { text: config.textColor, background: config.background });
    root.style.setProperty('--w-accent', config.accent);
    root.lang = config.locale;
    root.dir = config.locale === 'he' ? 'rtl' : 'ltr';
    container.append(root);

    let data: ZmanimData | null = null;

    const row = (label: string, at: string | null, next: boolean) =>
      el(
        'li',
        { className: `w-zm-row${next ? ' w-zm-next' : ''}` },
        el('span', { className: 'w-zm-label', dir: 'auto', text: label }),
        el('span', { className: 'w-zm-time', dir: 'ltr', text: at ? time(at) : '—' }),
      );

    const section = (title: string, rows: HTMLElement[]) =>
      el(
        'section',
        { className: 'w-zm-section' },
        el('h3', { className: 'w-zm-heading', text: title }),
        el('ul', { className: 'w-zm-list' }, ...rows),
      );

    const render = () => {
      heading.textContent = config.title ?? config.place.name;
      if (!data) {
        dates.textContent = t.waiting;
        return;
      }
      const now = ctx.now();
      const day = zmanimToday(data, now);
      if (!day) return;
      const noon = new Date(`${day.date}T12:00:00Z`);
      // Friday · 6 November 2026 · כ״ו חשון תשפ״ז
      dates.textContent = `${keyWeekday.format(noon)} · ${keyDate.format(noon)} · ${day.hebrewDate}`;
      const extra = [day.parasha, ...day.holidays].filter((s): s is string => Boolean(s));
      special.textContent = extra.join(' · ');
      special.hidden = extra.length === 0;

      // The next time still to come today (times and prayers alike) is marked.
      const upcoming = [...day.times.map((x) => x.at), ...day.prayers.map((x) => x.at)]
        .filter((at): at is string => at !== null && Date.parse(at) > now.getTime())
        .sort();
      const next = upcoming[0] ?? null;

      const parts: HTMLElement[] = [];
      if (day.times.length > 0) {
        parts.push(
          section(
            t.times,
            day.times.map((x) => row(labels[x.key], x.at, x.at !== null && x.at === next)),
          ),
        );
      }
      if (day.prayers.length > 0) {
        parts.push(
          section(
            t.prayers,
            day.prayers.map((x) => row(x.name, x.at, x.at !== null && x.at === next)),
          ),
        );
      }
      columns.replaceChildren(...parts);

      // The coming candle lighting and havdalah (havdalah alone during Shabbat or a holiday).
      const later = data.days.filter((d) => d.date >= day.date);
      const candles = later
        .map((d) => d.candles)
        .find((at): at is string => at !== null && Date.parse(at) > now.getTime());
      const havdalah = later
        .map((d) => d.havdalah)
        .find((at): at is string => at !== null && Date.parse(at) > now.getTime());
      const items: HTMLElement[] = [];
      const item = (label: string, at: string) =>
        el(
          'p',
          { className: 'w-zm-shabbat-item' },
          el('span', { className: 'w-zm-label', text: label }),
          el('span', {
            className: 'w-zm-time',
            dir: 'auto',
            text: `${weekday.format(new Date(at))} ${time(at)}`,
          }),
        );
      if (candles && (!havdalah || candles < havdalah)) items.push(item(t.candles, candles));
      if (havdalah) items.push(item(t.havdalah, havdalah));
      shabbat.replaceChildren(...items);
      shabbat.hidden = items.length === 0;
      method.textContent = t.method(data.method.candleMinutes, data.method.havdalah);
    };

    const load = async () => {
      try {
        const fresh = await ctx.fetchData<ZmanimData>();
        if (ctx.signal.aborted) return;
        data = fresh;
        render();
      } catch {
        // Offline with no copy yet: keep what is shown.
      }
    };
    render();
    void load();
    every(TICK_MS, ctx.signal, render);
    every(REFRESH_MS, ctx.signal, () => void load());
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
