// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_WIDGETS } from '../src/widgets';
import { WidgetRuntime } from '../src/widgets/runtime';

const MAP = '7d3e3b0e-8c43-4f43-9a52-2b2b3c1f0a11';
const CONFIG = {
  title: 'מגדל הגפן',
  floors: [{ name: '1' }, { name: '2', mapMediaId: MAP }],
  categories: ['רפואה', 'משרדים'],
  entries: [
    { name: 'מרפאת שיניים', floor: '2', room: '204', category: 'רפואה', direction: 'left' },
    { name: 'אדריכלים בע"מ', floor: '1', room: '101', category: 'משרדים' },
    { name: 'בית מרקחת', floor: '1', category: 'רפואה', direction: 'up', note: 'ליד המעלית' },
  ],
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(config: Record<string, unknown> = CONFIG) {
  const runtime = new WidgetRuntime({
    registry: BUILT_IN_WIDGETS,
    fetchData: () => Promise.reject(new Error('no data')),
    mediaUrl: (id) => Promise.resolve(id === MAP ? 'blob:floor-2' : null),
    timezone: () => 'Asia/Jerusalem',
    now: () => new Date(),
    reducedMotion: () => false,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const ok = runtime.mount(
    { id: 'dir', type: 'directory', config },
    container,
    new AbortController().signal,
  );
  return { container, ok };
}

const names = (root: ParentNode) =>
  [...root.querySelectorAll('.w-dir-name')].map((node) => node.textContent);
const chip = (root: ParentNode, label: string, group = 0) =>
  [...root.querySelectorAll('.w-dir-filter')[group]!.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )!;

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('directory widget', () => {
  it('lists entries by name, with floor, room and category, as named buttons', () => {
    const { container, ok } = mount();
    expect(ok).toBe(true);
    expect(container.querySelector('.w-dir-title')?.textContent).toBe('מגדל הגפן');
    expect(names(container)).toEqual(['אדריכלים בע"מ', 'בית מרקחת', 'מרפאת שיניים']);
    const first = container.querySelector('.w-dir-entry');
    expect(first?.getAttribute('aria-label')).toBe('אדריכלים בע"מ, קומה 1 · חדר 101 · משרדים');
    expect(container.querySelectorAll('.w-dir-entry')[2]?.getAttribute('aria-label')).toBe(
      'מרפאת שיניים, קומה 2 · חדר 204 · רפואה, שמאלה',
    );
    // A single page: no pager.
    expect(container.querySelector<HTMLElement>('.w-dir-pages')?.hidden).toBe(true);
  });

  it('filters by floor and category, says how many were found, and shows where an entry is', async () => {
    const { container } = mount();
    chip(container, '1').click();
    expect(names(container)).toEqual(['אדריכלים בע"מ', 'בית מרקחת']);
    expect(chip(container, '1').getAttribute('aria-pressed')).toBe('true');
    chip(container, 'רפואה', 1).click();
    expect(names(container)).toEqual(['בית מרקחת']);
    expect(container.querySelector('.w-dir-status')?.textContent).toBe('נמצאה רשומה אחת');

    chip(container, 'הכל').click();
    chip(container, 'הכל', 1).click();
    const dental = [...container.querySelectorAll<HTMLButtonElement>('.w-dir-entry')].find((b) =>
      b.textContent.includes('מרפאת שיניים'),
    )!;
    dental.click();
    await flush();
    const detail = container.querySelector<HTMLElement>('.w-dir-detail');
    expect(detail?.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe('מרפאת שיניים');
    expect(detail?.querySelector('.w-dir-facts')?.textContent).toBe('קומה2חדר204תחוםרפואה');
    expect(detail?.querySelector('.w-dir-way')?.textContent).toBe('שמאלה');
    const map = detail?.querySelector<HTMLImageElement>('.w-dir-map');
    expect(map?.getAttribute('src')).toBe('blob:floor-2');
    expect(map?.alt).toBe('מפת 2');

    detail?.querySelector<HTMLButtonElement>('.w-dir-back')?.click();
    expect(detail?.hidden).toBe(true);
    expect(document.activeElement).toBe(dental);
  });

  it('goes back to the full list when left alone, and turns pages by itself', () => {
    vi.useFakeTimers();
    const entries = Array.from({ length: 20 }, (_, i) => ({
      name: `Company ${String(i).padStart(2, '0')}`,
      floor: '1',
    }));
    const { container } = mount({
      floors: [{ name: '1' }, { name: '2' }],
      entries,
      idleSeconds: 10,
      pageSeconds: 5,
      locale: 'en',
    });
    expect(names(container)).toHaveLength(8);
    expect(container.querySelector('.w-dir-page')?.textContent).toBe('Page 1 of 3');
    chip(container, '2').click();
    expect(names(container)).toEqual([]);
    expect(container.querySelector('.w-dir-none')?.textContent).toBe('No entries');
    container.querySelector('.w-dir')?.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(9000);
    expect(chip(container, '2').getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(2000);
    expect(chip(container, 'All').getAttribute('aria-pressed')).toBe('true');
    expect(names(container)[0]).toBe('Company 00');
    vi.advanceTimersByTime(5000);
    expect(container.querySelector('.w-dir-page')?.textContent).toBe('Page 2 of 3');
    expect(names(container)[0]).toBe('Company 08');
  });

  it('refuses entries on floors that do not exist', () => {
    const { ok } = mount({ floors: [{ name: '1' }], entries: [{ name: 'X', floor: '9' }] });
    expect(ok).toBe(false);
  });
});
