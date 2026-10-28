// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  calendarConfigSchema,
  hour23,
  type CalendarData,
  type CalendarEvent,
  type WidgetConfig,
} from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';
import { applyColors } from './theme';

type CalendarConfig = WidgetConfig<'calendar'>;

const REFRESH_MS = 10 * 60 * 1000;
const TICK_MS = 60 * 1000;
const WEEK_PER_DAY = 5;

const TEXT = {
  he: {
    today: 'היום',
    tomorrow: 'מחר',
    allDay: 'כל היום',
    none: 'אין אירועים קרובים',
    more: (n: number) => `ועוד ${String(n)}`,
  },
  en: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    allDay: 'All day',
    none: 'No upcoming events',
    more: (n: number) => `+${String(n)} more`,
  },
} as const;

function safeFormat(locale: string, options: Intl.DateTimeFormatOptions, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, options);
  }
}

/**
 * Upcoming events of a public calendar (prepared by the Rubinny server from an iCal link):
 * a list grouped by day, or the coming seven days side by side. Finished events disappear
 * by themselves; the data is refreshed every 10 minutes.
 */
export const calendarWidget = defineWidget<CalendarConfig>({
  type: 'calendar',
  parseConfig: (config) => calendarConfigSchema.parse(config),
  render(container, config, ctx) {
    const t = TEXT[config.locale];
    const locale = config.locale === 'he' ? 'he-IL' : 'en-US';
    const zone = ctx.timezone;
    const dayKeyFormat = safeFormat(
      'en-CA',
      { year: 'numeric', month: '2-digit', day: '2-digit' },
      zone,
    );
    const timeFormat = safeFormat(
      locale,
      {
        hour: '2-digit',
        minute: '2-digit',
        ...(config.format === '24h' ? hour23() : { hour12: true }),
      },
      zone,
    );
    const dayFormat = safeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }, zone);
    const shortDay = safeFormat(
      locale,
      { weekday: 'short', day: 'numeric', month: 'numeric' },
      zone,
    );
    const dayKey = (date: Date) => dayKeyFormat.format(date);
    const time = (iso: string) => timeFormat.format(new Date(iso)).replace(/^24(?=\D)/, '00');
    /** A date-only key ("2026-11-01") at noon UTC, so it formats as that day in any zone. */
    const dateOfKey = (key: string) => new Date(`${key}T12:00:00Z`);

    const heading = el('h2', { className: 'w-cal-title', dir: 'auto' });
    const body = el('div', { className: 'w-cal-body' });
    const root = el('div', { className: `w-cal w-surface w-cal-${config.view}` }, heading, body);
    applyColors(root, { text: config.textColor, background: config.background });
    root.style.setProperty('--w-accent', config.accent);
    root.lang = config.locale;
    root.dir = config.locale === 'he' ? 'rtl' : 'ltr';
    container.append(root);

    let data: CalendarData | null = null;

    /** The days an event covers, as keys (all-day events end the day before their end date). */
    const keysOf = (event: CalendarEvent): { first: string; last: string } => {
      if (event.allDay) {
        const last = new Date(Date.parse(`${event.end}T12:00:00Z`) - 24 * 3_600_000);
        const lastKey = last.toISOString().slice(0, 10);
        return { first: event.start, last: lastKey < event.start ? event.start : lastKey };
      }
      return { first: dayKey(new Date(event.start)), last: dayKey(new Date(event.end)) };
    };

    const dayLabel = (key: string, todayKey: string, tomorrowKey: string) =>
      key === todayKey
        ? t.today
        : key === tomorrowKey
          ? t.tomorrow
          : dayFormat.format(dateOfKey(key));

    const eventItem = (event: CalendarEvent) =>
      el(
        'li',
        { className: 'w-cal-event' },
        el('span', {
          className: 'w-cal-time',
          dir: 'ltr',
          text: event.allDay ? t.allDay : `${time(event.start)}–${time(event.end)}`,
        }),
        el(
          'span',
          { className: 'w-cal-what' },
          el('span', { className: 'w-cal-name', dir: 'auto', text: event.title }),
          ...(event.location
            ? [el('span', { className: 'w-cal-place', dir: 'auto', text: event.location })]
            : []),
        ),
      );

    const render = () => {
      if (!data) return;
      const now = ctx.now();
      const todayKey = dayKey(now);
      const tomorrowKey = dayKey(new Date(now.getTime() + 24 * 3_600_000));
      const current = data.events.filter((e) =>
        e.allDay ? keysOf(e).last >= todayKey : Date.parse(e.end) > now.getTime(),
      );
      heading.textContent = config.title ?? data.title ?? '';
      heading.hidden = heading.textContent === '';

      if (current.length === 0) {
        body.replaceChildren(el('p', { className: 'w-cal-none', text: t.none }));
        return;
      }

      if (config.view === 'agenda') {
        const groups = new Map<string, CalendarEvent[]>();
        for (const event of current.slice(0, config.maxEvents)) {
          // An event that started before today is listed today.
          const first = keysOf(event).first;
          const key = first < todayKey ? todayKey : first;
          const list = groups.get(key) ?? [];
          list.push(event);
          groups.set(key, list);
        }
        body.replaceChildren(
          ...[...groups.entries()].map(([key, events]) =>
            el(
              'section',
              { className: 'w-cal-day' },
              el('h3', { className: 'w-cal-day-name', text: dayLabel(key, todayKey, tomorrowKey) }),
              el('ul', { className: 'w-cal-list' }, ...events.map(eventItem)),
            ),
          ),
        );
        return;
      }

      // Week: the next seven days, side by side.
      const columns = Array.from({ length: 7 }, (_, i) => {
        const key = dayKey(new Date(now.getTime() + i * 24 * 3_600_000));
        const events = current.filter((e) => {
          const span = keysOf(e);
          return span.first <= key && span.last >= key;
        });
        const shown = events.slice(0, WEEK_PER_DAY);
        return el(
          'section',
          { className: `w-cal-col${key === todayKey ? ' w-cal-today' : ''}` },
          el('h3', {
            className: 'w-cal-day-name',
            text: key === todayKey ? t.today : shortDay.format(dateOfKey(key)),
          }),
          el(
            'ul',
            { className: 'w-cal-list' },
            ...shown.map(eventItem),
            ...(events.length > shown.length
              ? [el('li', { className: 'w-cal-more', text: t.more(events.length - shown.length) })]
              : []),
          ),
        );
      });
      body.replaceChildren(...columns);
    };

    const load = async () => {
      try {
        const fresh = await ctx.fetchData<CalendarData>();
        if (ctx.signal.aborted) return;
        data = fresh;
        render();
      } catch {
        // Offline with no copy yet, or the calendar is down: keep what is shown.
      }
    };
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
