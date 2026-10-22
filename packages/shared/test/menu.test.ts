import { describe, expect, it } from 'vitest';
import {
  MENU_MAX_ITEMS,
  formatMenuPrice,
  menuConfigSchema,
  parseWidgetConfig,
} from '../src/index.js';

const item = (name: string, price?: string) => ({ name, ...(price ? { price } : {}) });

describe('menu widget', () => {
  it('fills defaults and keeps sections, items, prices and tags', () => {
    const menu = menuConfigSchema.parse({
      title: 'Menu',
      sections: [{ title: 'Mains', items: [{ ...item('Pasta', '58'), tags: ['vegan', 'new'] }] }],
    });
    expect(menu).toMatchObject({ columns: 2, style: 'modern', currency: 'ILS', locale: 'he' });
    expect(menu.sections[0]?.items[0]?.tags).toEqual(['vegan', 'new']);
  });

  it('refuses empty menus, unknown tags, too many tags and too many items', () => {
    const ok = (config: unknown) => menuConfigSchema.safeParse(config).success;
    expect(ok({ sections: [] })).toBe(false);
    expect(ok({ sections: [{ items: [{ name: 'x', tags: ['halal-ish'] }] }] })).toBe(false);
    expect(
      ok({
        sections: [
          { items: [{ name: 'x', tags: ['vegan', 'spicy', 'new', 'recommended', 'vegetarian'] }] },
        ],
      }),
    ).toBe(false);
    expect(ok({ sections: [{ items: [{ name: '' }] }] })).toBe(false);
    const section = { items: Array.from({ length: 40 }, (_, i) => item(`Dish ${String(i)}`)) };
    expect(ok({ sections: [section, section] })).toBe(true);
    expect(MENU_MAX_ITEMS).toBe(80);
    expect(ok({ sections: [section, section, { items: [item('One more')] }] })).toBe(false);
    expect(ok({ sections: [{ items: [] }], columns: 4 })).toBe(false);
    expect(ok({ sections: [{ items: [] }], textColor: 'red' })).toBe(false);
  });

  it('reports nested errors by path, for the form', () => {
    const result = parseWidgetConfig('menu', {
      sections: [{ items: [{ name: 'ok' }, { name: '' }] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path)).toContain('sections.0.items.1.name');
    }
  });

  it('formats numbers as prices in the language of the menu, and leaves other text as is', () => {
    expect(formatMenuPrice('42', 'USD', 'en')).toBe('$42');
    expect(formatMenuPrice('42.5', 'USD', 'en')).toBe('$42.50');
    expect(formatMenuPrice('9.90', 'EUR', 'en')).toBe('€9.90');
    // Hebrew puts the shekel sign after the number (with direction marks).
    expect(
      formatMenuPrice('42', 'ILS', 'he')
        .replace(/[^\d₪]+/g, ' ')
        .trim(),
    ).toBe('42 ₪');
    expect(formatMenuPrice('17:30 · 20:00', 'ILS', 'he')).toBe('17:30 · 20:00');
    expect(formatMenuPrice('market price', 'USD', 'en')).toBe('market price');
    expect(formatMenuPrice('42', 'none', 'en')).toBe('42');
    expect(formatMenuPrice(undefined, 'ILS', 'he')).toBe('');
    expect(formatMenuPrice('12345678', 'USD', 'en')).toBe('12345678');
  });
});
