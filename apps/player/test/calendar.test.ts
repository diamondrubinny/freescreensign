// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, describe, expect, it } from 'vitest';
import type { CalendarData } from '@rubinny/shared';
import { BUILT_IN_WIDGETS } from '../src/widgets';
import { WidgetRuntime } from '../src/widgets/runtime';

/** Sunday 1 November 2026, 09:00 in Jerusalem. */
const NOW = new Date('2026-11-01T07:00:00Z');

const DATA: CalendarData = {
  title: 'מתנ"ס הגפן',
  events: [
    { title: 'יום ספורט', start: '2026-11-01', end: '2026-11-02', allDay: true, location: null },
    {
      title: 'ישיבת בוקר',
      start: '2026-11-01T05:00:00Z',
      end: '2026-11-01T06:00:00Z',
      allDay: false,
      location: null,
    },
    {
      title: 'חוג ציור',
      start: '2026-11-01T15:00:00Z',
      end: '2026-11-01T16:30:00Z',
      allDay: false,
      location: 'חדר 2',
    },
    {
      title: 'יוגה',
      start: '2026-11-02T18:00:00Z',
      end: '2026-11-02T19:00:00Z',
      allDay: false,
      location: null,
    },
    {
      title: '<b>טיול</b>',
      start: '2026-11-05T05:00:00Z',
      end: '2026-11-05T12:00:00Z',
      allDay: false,
      location: null,
    },
  ],
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(config: object) {
  const runtime = new WidgetRuntime({
    registry: BUILT_IN_WIDGETS,
    fetchData: () => Promise.resolve(DATA),
    mediaUrl: () => Promise.resolve(null),
    timezone: () => 'Asia/Jerusalem',
    now: () => NOW,
    reducedMotion: () => false,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const ok = runtime.mount(
    { id: 'cal', type: 'calendar', config: { url: 'https://x.example/c.ics', ...config } },
    container,
    new AbortController().signal,
  );
  await flush();
  return { container, ok };
}

const texts = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent);

afterEach(() => {
  document.body.replaceChildren();
});

describe('calendar widget', () => {
  it('lists upcoming events by day, in the screen’s time zone, without finished ones', async () => {
    const { container, ok } = await mount({ maxEvents: 6 });
    expect(ok).toBe(true);
    expect(container.querySelector('.w-cal-title')?.textContent).toBe('מתנ"ס הגפן');
    expect(texts(container, '.w-cal-day-name')).toEqual(['היום', 'מחר', 'יום חמישי, 5 בנובמבר']);
    expect(texts(container, '.w-cal-name')).toEqual([
      'יום ספורט',
      'חוג ציור',
      'יוגה',
      '<b>טיול</b>',
    ]);
    expect(texts(container, '.w-cal-time')).toEqual([
      'כל היום',
      '17:00–18:30',
      '20:00–21:00',
      '07:00–14:00',
    ]);
    expect(texts(container, '.w-cal-place')).toEqual(['חדר 2']);
    // Text, never HTML.
    expect(container.querySelector('b')).toBeNull();
  });

  it('respects the number of events and the title from the settings, in English', async () => {
    const { container } = await mount({ maxEvents: 2, title: 'Events', locale: 'en' });
    expect(container.querySelector('.w-cal-title')?.textContent).toBe('Events');
    expect(texts(container, '.w-cal-name')).toEqual(['יום ספורט', 'חוג ציור']);
    expect(texts(container, '.w-cal-day-name')).toEqual(['Today']);
    expect(container.querySelector('.w-cal')?.getAttribute('dir')).toBe('ltr');
  });

  it('shows the coming seven days side by side in the week view', async () => {
    const { container } = await mount({ view: 'week' });
    const columns = container.querySelectorAll('.w-cal-col');
    expect(columns).toHaveLength(7);
    expect(columns[0]?.classList.contains('w-cal-today')).toBe(true);
    expect(texts(columns[0]!, '.w-cal-name')).toEqual(['יום ספורט', 'חוג ציור']);
    expect(texts(columns[4]!, '.w-cal-name')).toEqual(['<b>טיול</b>']);
    expect(texts(columns[6]!, '.w-cal-name')).toEqual([]);
  });
});
