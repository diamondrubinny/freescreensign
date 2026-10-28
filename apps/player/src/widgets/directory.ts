// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { directoryConfigSchema, type DirectoryDirection, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';
import { applyColors } from './theme';

type DirectoryConfig = WidgetConfig<'directory'>;
type Entry = DirectoryConfig['entries'][number];

const ROWS_PER_PAGE = 8;

const TEXT = {
  he: {
    all: 'הכל',
    floor: 'קומה',
    floors: 'סינון לפי קומה',
    categories: 'סינון לפי תחום',
    room: 'חדר',
    category: 'תחום',
    page: (n: number, of: number) => `עמוד ${String(n)} מתוך ${String(of)}`,
    prev: 'העמוד הקודם',
    next: 'העמוד הבא',
    back: 'חזרה לרשימה',
    results: (n: number) => (n === 1 ? 'נמצאה רשומה אחת' : `נמצאו ${String(n)} רשומות`),
    none: 'אין רשומות',
    map: (floor: string) => `מפת ${floor}`,
    directions: {
      none: '',
      left: 'שמאלה',
      right: 'ימינה',
      straight: 'ישר',
      back: 'אחורה',
      up: 'קומה למעלה',
      down: 'קומה למטה',
    },
  },
  en: {
    all: 'All',
    floor: 'Floor',
    floors: 'Filter by floor',
    categories: 'Filter by category',
    room: 'Room',
    category: 'Category',
    page: (n: number, of: number) => `Page ${String(n)} of ${String(of)}`,
    prev: 'Previous page',
    next: 'Next page',
    back: 'Back to the list',
    results: (n: number) => (n === 1 ? 'One entry found' : `${String(n)} entries found`),
    none: 'No entries',
    map: (floor: string) => `Map of ${floor}`,
    directions: {
      none: '',
      left: 'Left',
      right: 'Right',
      straight: 'Straight ahead',
      back: 'Behind you',
      up: 'One floor up',
      down: 'One floor down',
    },
  },
} as const;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** An arrow (rotated for left/right/back) or a double chevron for floors up and down. */
function arrow(direction: DirectionWithArrow, className: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(SVG_NS, 'path');
  const d =
    direction === 'up'
      ? 'M6 13l6-6 6 6M6 19l6-6 6 6'
      : direction === 'down'
        ? 'M6 5l6 6 6-6M6 11l6 6 6-6'
        : 'M12 20V4M5 11l7-7 7 7';
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  const turn = { straight: 0, right: 90, back: 180, left: 270, up: 0, down: 0 }[direction];
  if (turn) svg.style.transform = `rotate(${String(turn)}deg)`;
  svg.append(path);
  return svg;
}
type DirectionWithArrow = Exclude<DirectoryDirection, 'none'>;

/**
 * A building directory: entries sorted by name, filtered by floor and category, in pages that
 * turn by themselves when nobody touches the screen. Tapping an entry shows where it is, with
 * an arrow and the floor's map; the screen goes back to the full list when left alone.
 */
export const directoryWidget = defineWidget<DirectoryConfig>({
  type: 'directory',
  parseConfig: (config) => directoryConfigSchema.parse(config),
  render(container, config, ctx) {
    const t = TEXT[config.locale];
    const collator = new Intl.Collator(config.locale === 'he' ? 'he' : 'en');
    const entries = [...config.entries].sort((a, b) => collator.compare(a.name, b.name));

    const heading = el('h2', { className: 'w-dir-title', dir: 'auto', text: config.title ?? '' });
    const floorBar = el('div', { className: 'w-dir-filter' });
    floorBar.setAttribute('role', 'group');
    floorBar.setAttribute('aria-label', t.floors);
    const categoryBar = el('div', { className: 'w-dir-filter' });
    categoryBar.setAttribute('role', 'group');
    categoryBar.setAttribute('aria-label', t.categories);
    const list = el('ul', { className: 'w-dir-list' });
    const status = el('p', { className: 'w-dir-status' });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const pageText = el('span', { className: 'w-dir-page' });
    const prev = el('button', { className: 'w-dir-pager', text: '‹' });
    const next = el('button', { className: 'w-dir-pager', text: '›' });
    prev.type = 'button';
    next.type = 'button';
    prev.setAttribute('aria-label', t.prev);
    next.setAttribute('aria-label', t.next);
    const pager = el('div', { className: 'w-dir-pages' }, prev, pageText, next);
    const listView = el('div', { className: 'w-dir-view' }, list, pager);

    const detailTitle = el('h3', { className: 'w-dir-detail-name', dir: 'auto' });
    detailTitle.tabIndex = -1;
    const detailFacts = el('dl', { className: 'w-dir-facts' });
    const detailWay = el('div', { className: 'w-dir-way' });
    const detailNote = el('p', { className: 'w-dir-note', dir: 'auto' });
    const detailMap = el('img', { className: 'w-dir-map' });
    const backButton = el('button', { className: 'w-dir-back', text: t.back });
    backButton.type = 'button';
    const detail = el(
      'section',
      { className: 'w-dir-detail' },
      el(
        'div',
        { className: 'w-dir-detail-text' },
        detailTitle,
        detailFacts,
        detailWay,
        detailNote,
      ),
      detailMap,
      backButton,
    );
    detail.hidden = true;

    const root = el(
      'div',
      { className: 'w-dir w-surface' },
      heading,
      floorBar,
      categoryBar,
      status,
      listView,
      detail,
    );
    heading.hidden = !config.title;
    applyColors(root, { text: config.textColor, background: config.background });
    root.style.setProperty('--w-accent', config.accent);
    root.lang = config.locale;
    root.dir = config.locale === 'he' ? 'rtl' : 'ltr';
    container.append(root);

    let floor: string | null = null;
    let category: string | null = null;
    let page = 0;
    let lastTouch = 0;
    let lastPageTurn = Date.now();
    let opened: HTMLElement | null = null;

    const filtered = () =>
      entries.filter(
        (entry) =>
          (floor === null || entry.floor === floor) &&
          (category === null || entry.category === category),
      );

    const chip = (label: string, pressed: boolean, onPress: () => void) => {
      const button = el('button', { className: 'w-dir-chip', dir: 'auto', text: label });
      button.type = 'button';
      button.setAttribute('aria-pressed', String(pressed));
      button.addEventListener('click', onPress);
      return button;
    };

    const renderFilters = () => {
      floorBar.replaceChildren(
        el('span', { className: 'w-dir-filter-label', text: t.floor }),
        chip(t.all, floor === null, () => {
          floor = null;
          page = 0;
          renderAll(true);
        }),
        ...config.floors.map((f) =>
          chip(f.name, floor === f.name, () => {
            floor = f.name;
            page = 0;
            renderAll(true);
          }),
        ),
      );
      categoryBar.hidden = config.categories.length === 0;
      categoryBar.replaceChildren(
        el('span', { className: 'w-dir-filter-label', text: t.category }),
        chip(t.all, category === null, () => {
          category = null;
          page = 0;
          renderAll(true);
        }),
        ...config.categories.map((c) =>
          chip(c, category === c, () => {
            category = c;
            page = 0;
            renderAll(true);
          }),
        ),
      );
    };

    const meta = (entry: Entry) =>
      [
        `${t.floor} ${entry.floor}`,
        entry.room ? `${t.room} ${entry.room}` : '',
        entry.category ?? '',
      ]
        .filter(Boolean)
        .join(' · ');

    const renderList = (announce: boolean) => {
      const shown = filtered();
      const pages = Math.max(1, Math.ceil(shown.length / ROWS_PER_PAGE));
      page = Math.min(page, pages - 1);
      list.replaceChildren(
        ...(shown.length === 0
          ? [el('li', { className: 'w-dir-none', text: t.none })]
          : shown.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE).map((entry) => {
              const way = entry.direction !== 'none' ? entry.direction : null;
              const button = el(
                'button',
                { className: 'w-dir-entry' },
                el('span', { className: 'w-dir-name', dir: 'auto', text: entry.name }),
                el('span', { className: 'w-dir-meta', dir: 'auto', text: meta(entry) }),
                ...(way ? [arrow(way, 'w-dir-arrow')] : []),
              );
              button.type = 'button';
              button.setAttribute(
                'aria-label',
                [entry.name, meta(entry), way ? t.directions[way] : ''].filter(Boolean).join(', '),
              );
              button.addEventListener('click', () => {
                openDetail(entry, button);
              });
              return el('li', {}, button);
            })),
      );
      pageText.textContent = t.page(page + 1, pages);
      pager.hidden = pages <= 1;
      prev.disabled = page === 0;
      next.disabled = page >= pages - 1;
      if (announce) status.textContent = t.results(shown.length);
    };

    const renderAll = (announce = false) => {
      renderFilters();
      renderList(announce);
    };

    const openDetail = (entry: Entry, from: HTMLElement) => {
      opened = from;
      detailTitle.textContent = entry.name;
      const facts: [string, string][] = [[t.floor, entry.floor]];
      if (entry.room) facts.push([t.room, entry.room]);
      if (entry.category) facts.push([t.category, entry.category]);
      detailFacts.replaceChildren(
        ...facts.flatMap(([term, value]) => [
          el('dt', { text: term }),
          el('dd', { dir: 'auto', text: value }),
        ]),
      );
      const way = entry.direction !== 'none' ? entry.direction : null;
      detailWay.replaceChildren(
        ...(way ? [arrow(way, 'w-dir-way-arrow'), el('span', { text: t.directions[way] })] : []),
      );
      detailWay.hidden = !way;
      detailNote.textContent = entry.note ?? '';
      detailNote.hidden = !entry.note;
      detailMap.hidden = true;
      detailMap.removeAttribute('src');
      const mapId = config.floors.find((f) => f.name === entry.floor)?.mapMediaId;
      if (mapId) {
        detailMap.alt = t.map(entry.floor);
        void ctx.mediaUrl(mapId).then((url) => {
          if (!url || detail.hidden || detailTitle.textContent !== entry.name) return;
          detailMap.src = url;
          detailMap.hidden = false;
        });
      }
      listView.hidden = true;
      detail.hidden = false;
      detailTitle.focus();
    };

    const closeDetail = () => {
      detail.hidden = true;
      listView.hidden = false;
      opened?.focus();
      opened = null;
    };
    backButton.addEventListener('click', closeDetail);
    prev.addEventListener('click', () => {
      page--;
      renderList(false);
    });
    next.addEventListener('click', () => {
      page++;
      renderList(false);
    });
    for (const type of ['pointerdown', 'keydown'] as const) {
      root.addEventListener(
        type,
        () => {
          lastTouch = Date.now();
        },
        { passive: true },
      );
    }

    renderAll();
    every(1000, ctx.signal, () => {
      const now = Date.now();
      const idle = now - lastTouch > config.idleSeconds * 1000;
      if (!idle) return;
      // Left alone: back to the full list…
      if (floor !== null || category !== null || !detail.hidden) {
        floor = null;
        category = null;
        page = 0;
        detail.hidden = true;
        listView.hidden = false;
        opened = null;
        renderAll();
        lastPageTurn = now;
        return;
      }
      // …and long lists turn their pages by themselves.
      if (now - lastPageTurn >= config.pageSeconds * 1000) {
        lastPageTurn = now;
        const pages = Math.max(1, Math.ceil(entries.length / ROWS_PER_PAGE));
        if (pages > 1) {
          page = (page + 1) % pages;
          renderList(false);
        }
      }
    });
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
