// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import {
  DESIGN_FONT_FAMILIES,
  MENU_TAG_LABELS,
  formatMenuPrice,
  menuConfigSchema,
  type WidgetConfig,
} from '@rubinny/shared';
import { defineWidget, el, textDirection } from '@rubinny/widget-sdk';
import { fitText, onLayout } from './fit';
import { applyColors } from './theme';

const STYLE_FONTS = {
  modern: DESIGN_FONT_FAMILIES.heebo,
  classic: DESIGN_FONT_FAMILIES['frank-ruhl'],
  chalkboard: DESIGN_FONT_FAMILIES.rubik,
} as const;

/**
 * A menu or price list: sections of items in columns, a dotted line from each name to its
 * price, short descriptions and tags. Everything shrinks together until it fits the zone.
 */
export const menuWidget = defineWidget<WidgetConfig<'menu'>>({
  type: 'menu',
  parseConfig: (config) => menuConfigSchema.parse(config),
  render(container, config, ctx) {
    const dir = config.locale === 'en' ? 'ltr' : 'rtl';
    const tags = MENU_TAG_LABELS[config.locale];
    const content = el('div', { className: 'w-menu-content' });

    if (config.title || config.subtitle) {
      const head = el('header', { className: 'w-menu-head' });
      if (config.title) {
        head.append(
          el('h2', {
            className: 'w-menu-title',
            text: config.title,
            dir: textDirection(config.title),
          }),
        );
      }
      if (config.subtitle) {
        head.append(el('p', { className: 'w-menu-subtitle', text: config.subtitle }));
      }
      content.append(head);
    }

    const body = el('div', { className: 'w-menu-body' });
    body.style.setProperty('column-count', String(config.columns));
    for (const section of config.sections) {
      const block = el('section', { className: 'w-menu-section' });
      if (section.title)
        block.append(el('h3', { className: 'w-menu-section-title', text: section.title }));
      const list = el('ul', { className: 'w-menu-items' });
      for (const item of section.items) {
        const price = formatMenuPrice(item.price, config.currency, config.locale);
        const row = el(
          'div',
          { className: 'w-menu-row' },
          // <bdi>: a name or price in the other language keeps its own direction.
          el('span', { className: 'w-menu-name' }, el('bdi', { text: item.name })),
          el('span', { className: 'w-menu-dots' }),
        );
        if (price) {
          // In the menu's direction: a Hebrew list of times reads from the right.
          row.append(el('span', { className: 'w-menu-price' }, el('bdi', { text: price, dir })));
        }
        const entry = el('li', { className: 'w-menu-item' }, row);
        // Description and tags share one line, so long menus stay larger.
        if (item.description || item.tags.length > 0) {
          const meta = el('p', { className: 'w-menu-meta' });
          if (item.description) {
            meta.append(el('span', { className: 'w-menu-desc', text: item.description }));
          }
          for (const tag of item.tags) {
            meta.append(el('span', { className: `w-menu-tag w-menu-tag-${tag}`, text: tags[tag] }));
          }
          entry.append(meta);
        }
        list.append(entry);
      }
      block.append(list);
      body.append(block);
    }
    content.append(body);

    const root = el('div', { className: `w-menu w-surface w-menu-${config.style}`, dir }, content);
    root.style.fontFamily = STYLE_FONTS[config.style];
    root.style.setProperty('--w-accent', config.accent);
    applyColors(root, { text: config.textColor, background: config.background });
    container.append(root);
    onLayout(ctx.signal, () => {
      fitText(content, root);
    });
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
