// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { tableConfigSchema, type TableData, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, every } from '@rubinny/widget-sdk';
import { fitText, onLayout } from './fit';
import { applyColors } from './theme';

/**
 * A table from a CSV, Google Sheets or JSON source (fetched and cleaned by the Rubinny
 * server). Rows beyond one page rotate in pages; the data refreshes on its own.
 */
export const tableWidget = defineWidget<WidgetConfig<'table'>>({
  type: 'table',
  parseConfig: (config) => tableConfigSchema.parse(config),
  render(container, config, ctx) {
    const dir = config.locale === 'en' ? 'ltr' : 'rtl';
    const table = el('table', { className: 'w-table-grid' });
    const body = el('div', { className: 'w-table-body' }, table);
    const pager = el('div', { className: 'w-table-pager', dir: 'ltr' });
    const root = el('div', { className: 'w-table w-surface', dir });
    root.style.setProperty('--w-accent', config.accent);
    // Lines sharing the zone height: the rows, the header and the title.
    root.style.setProperty('--rows', String(config.rowsPerPage + (config.title ? 2.5 : 1)));
    applyColors(root, { text: config.textColor, background: config.background });
    const caption = config.title
      ? el('caption', { className: 'w-table-title' }, el('bdi', { text: config.title }))
      : null;
    root.append(body, pager);
    container.append(root);

    let data: TableData | null = null;
    let page = 0;

    const pageCount = () =>
      data ? Math.max(1, Math.ceil(data.rows.length / config.rowsPerPage)) : 1;

    const show = () => {
      if (!data) return;
      const count = pageCount();
      page %= count;
      const head = el(
        'thead',
        {},
        el(
          'tr',
          {},
          ...data.columns.map((name) => {
            // <bdi>: each value keeps its own direction; alignment follows the table's.
            const cell = el('th', {}, el('bdi', { text: name }));
            cell.scope = 'col';
            return cell;
          }),
        ),
      );
      const start = page * config.rowsPerPage;
      const rows = data.rows.slice(start, start + config.rowsPerPage);
      const tbody = el(
        'tbody',
        {},
        ...rows.map((row) =>
          el('tr', {}, ...row.map((value) => el('td', {}, el('bdi', { text: value })))),
        ),
      );
      table.replaceChildren(...(caption ? [caption] : []), head, tbody);
      table.classList.toggle('w-table-fade', !ctx.reducedMotion);
      pager.replaceChildren(
        ...(count > 1
          ? Array.from({ length: count }, (_, i) =>
              el('span', { className: i === page ? 'active' : '' }),
            )
          : []),
      );
      fitText(table, body);
    };

    const load = async () => {
      try {
        const next = await ctx.fetchData<TableData>();
        if (ctx.signal.aborted) return;
        data = next;
        show();
      } catch {
        // No data yet (offline, source down): keep what is shown.
      }
    };

    void load();
    onLayout(ctx.signal, show);
    every(config.pageDurationMs, ctx.signal, () => {
      if (pageCount() <= 1) return;
      page++;
      show();
    });
    every(config.refreshMinutes * 60_000, ctx.signal, () => void load());
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
