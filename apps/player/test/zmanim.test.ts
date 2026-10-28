// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, describe, expect, it } from 'vitest';
import type { ZmanimData } from '@rubinny/shared';
import { BUILT_IN_WIDGETS } from '../src/widgets';
import { WidgetRuntime } from '../src/widgets/runtime';
import { zmanimToday } from '../src/widgets/zmanim';

const PLACE = {
  name: 'בית הכנסת',
  latitude: 31.77,
  longitude: 35.21,
  timezone: 'Asia/Jerusalem',
  israel: true,
};

/** Friday 6 November 2026 and Shabbat, as the server sends them (times in UTC). */
const DATA: ZmanimData = {
  place: { name: 'בית הכנסת', timezone: 'Asia/Jerusalem' },
  days: [
    {
      date: '2026-11-06',
      hebrewDate: 'כ״ו חשון תשפ״ז',
      parasha: 'פרשת חיי שרה',
      holidays: [],
      times: [
        { key: 'sunrise', at: '2026-11-06T03:59:00Z' },
        { key: 'sunset', at: '2026-11-06T14:45:00Z' },
      ],
      prayers: [
        { name: 'שחרית', at: '2026-11-06T04:30:00Z' },
        { name: 'מנחה <b>', at: '2026-11-06T14:30:00Z' },
      ],
      candles: '2026-11-06T14:05:00Z',
      havdalah: null,
    },
    {
      date: '2026-11-07',
      hebrewDate: 'כ״ז חשון תשפ״ז',
      parasha: 'פרשת חיי שרה',
      holidays: ['ראש חודש'],
      times: [
        { key: 'sunrise', at: '2026-11-07T04:00:00Z' },
        { key: 'sunset', at: null },
      ],
      prayers: [],
      candles: null,
      havdalah: '2026-11-07T15:22:00Z',
    },
  ],
  method: { candleMinutes: 40, havdalah: 'tzeit' },
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(now: Date, config: object = {}) {
  const runtime = new WidgetRuntime({
    registry: BUILT_IN_WIDGETS,
    fetchData: () => Promise.resolve(DATA),
    mediaUrl: () => Promise.resolve(null),
    // The screen is elsewhere; times follow the place.
    timezone: () => 'Europe/London',
    now: () => now,
    reducedMotion: () => false,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const ok = runtime.mount(
    { id: 'zm', type: 'zmanim', config: { place: PLACE, ...config } },
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

describe('zmanim widget', () => {
  it('shows the day in the place, its times and prayers, and marks the next one', async () => {
    // Friday 10:00 in Jerusalem.
    const { container, ok } = await mount(new Date('2026-11-06T08:00:00Z'));
    expect(ok).toBe(true);
    const root = container.querySelector('.w-zm')!;
    expect(root.getAttribute('dir')).toBe('rtl');
    expect(texts(root, '.w-zm-title')).toEqual(['בית הכנסת']);
    expect(root.querySelector('.w-zm-dates')!.textContent).toContain('כ״ו חשון תשפ״ז');
    expect(root.querySelector('.w-zm-dates')!.textContent).toContain('שישי');
    expect(texts(root, '.w-zm-special')).toEqual(['פרשת חיי שרה']);
    expect(texts(root, '.w-zm-heading')).toEqual(['זמני היום', 'זמני תפילות']);
    expect(texts(root, '.w-zm-row .w-zm-time')).toEqual(['05:59', '16:45', '06:30', '16:30']);
    // Names are text, never markup.
    expect(root.querySelector('b')).toBeNull();
    expect(texts(root, '.w-zm-row .w-zm-label')).toContain('מנחה <b>');
    // The next time to come today: Mincha at 16:30.
    expect(texts(root, '.w-zm-next .w-zm-label')).toEqual(['מנחה <b>']);
    // Candle lighting today, then havdalah.
    expect(texts(root, '.w-zm-shabbat-item .w-zm-label')).toEqual(['הדלקת נרות', 'צאת השבת / החג']);
    expect(root.querySelector('.w-zm-method')!.textContent).toContain('40 דקות');
  });

  it('shows havdalah alone during Shabbat, holidays, and a dash for missing times', async () => {
    // Shabbat 11:00 in Jerusalem.
    const { container } = await mount(new Date('2026-11-07T09:00:00Z'), { locale: 'en' });
    const root = container.querySelector('.w-zm')!;
    expect(root.getAttribute('dir')).toBe('ltr');
    expect(texts(root, '.w-zm-special')).toEqual(['פרשת חיי שרה · ראש חודש']);
    expect(texts(root, '.w-zm-row .w-zm-label')).toEqual(['Sunrise', 'Sunset']);
    expect(texts(root, '.w-zm-row .w-zm-time')).toEqual(['06:00', '—']);
    expect(texts(root, '.w-zm-heading')).toEqual(['Times of the day']);
    expect(texts(root, '.w-zm-shabbat-item .w-zm-label')).toEqual(['Havdalah']);
  });

  it('picks today in the place, or the last day the data covers when it runs out', () => {
    // 23:30 UTC on the 6th is already Shabbat in Jerusalem.
    expect(zmanimToday(DATA, new Date('2026-11-06T23:30:00Z'))?.date).toBe('2026-11-07');
    expect(zmanimToday(DATA, new Date('2026-11-20T10:00:00Z'))?.date).toBe('2026-11-07');
    expect(zmanimToday(DATA, new Date('2026-11-01T10:00:00Z'))?.date).toBe('2026-11-06');
  });
});
