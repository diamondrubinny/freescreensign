import type { LayoutTemplateId, WidgetType } from '@rubinny/shared';

type Locale = 'he' | 'en';
type Localized<T> = Record<Locale, T>;

export interface KitWidget {
  key: string;
  type: WidgetType;
  name: Localized<string>;
  config: Localized<Record<string, unknown>>;
}

export interface StarterKit {
  id: string;
  template: LayoutTemplateId;
  name: Localized<string>;
  background: string;
  widgets: KitWidget[];
  /** One playlist per template zone (by zone name); an empty list is for the user's media. */
  zones: Record<string, { playlist: Localized<string>; widgets: string[] }>;
}

/**
 * Ready-made screens. All content is sample text the user edits afterwards;
 * nothing here points at real third-party services.
 */
export const STARTER_KITS: readonly StarterKit[] = [
  {
    id: 'lobby',
    template: 'l-bar',
    name: { he: 'לובי', en: 'Lobby' },
    background: '#0f172a',
    widgets: [
      {
        key: 'clock',
        type: 'clock',
        name: { he: 'שעון לובי', en: 'Lobby clock' },
        config: {
          he: { locale: 'he', background: '#1e1b4b', textColor: '#ffffff' },
          en: { locale: 'en', background: '#1e1b4b', textColor: '#ffffff' },
        },
      },
      {
        key: 'qr',
        type: 'qr',
        name: { he: 'QR לפרטים', en: 'Details QR' },
        config: {
          he: { url: 'https://example.org', label: 'סרקו לפרטים נוספים', background: '#ffffff' },
          en: { url: 'https://example.org', label: 'Scan for details', background: '#ffffff' },
        },
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: { he: 'עדכונים', en: 'Updates' },
        config: {
          he: {
            label: 'עדכונים',
            text: 'ברוכים הבאים! · ערכו את הטקסט הזה ב-Widgets › עדכונים · יום נעים',
            background: '#4f46e5',
          },
          en: {
            label: 'Updates',
            text: 'Welcome! · Edit this text in Widgets › Updates · Have a great day',
            background: '#4f46e5',
          },
        },
      },
    ],
    zones: {
      main: { playlist: { he: 'לובי — תוכן ראשי', en: 'Lobby — main content' }, widgets: [] },
      side: { playlist: { he: 'לובי — צד', en: 'Lobby — side' }, widgets: ['clock', 'qr'] },
      bottom: { playlist: { he: 'לובי — עדכונים', en: 'Lobby — updates' }, widgets: ['ticker'] },
    },
  },
  {
    id: 'menu',
    template: 'grid-2x2',
    name: { he: 'תפריט', en: 'Menu board' },
    background: '#1c1917',
    widgets: (
      [
        [
          'starters',
          'מנות ראשונות',
          'Starters',
          'סלט ירוק · 32\nחומוס הבית · 28\nמרק היום · 30',
          'Green salad · 9\nHouse hummus · 8\nSoup of the day · 9',
          '#7c2d12',
        ],
        [
          'mains',
          'עיקריות',
          'Mains',
          'שניצל ופירה · 62\nפסטה ברוטב עגבניות · 54\nקציצות דגים · 68',
          'Schnitzel and mash · 18\nTomato pasta · 15\nFish patties · 19',
          '#9a3412',
        ],
        [
          'desserts',
          'קינוחים',
          'Desserts',
          'עוגת שוקולד · 26\nסלט פירות · 22',
          'Chocolate cake · 7\nFruit salad · 6',
          '#a16207',
        ],
        [
          'drinks',
          'שתייה',
          'Drinks',
          'לימונדה · 14\nקפה · 12\nתה · 10',
          'Lemonade · 4\nCoffee · 3\nTea · 3',
          '#3f6212',
        ],
      ] as const
    ).map(([key, he, en, textHe, textEn, background]) => ({
      key,
      type: 'text' as const,
      name: { he, en },
      config: {
        he: { title: he, text: textHe, align: 'start', size: 'medium', background },
        en: { title: en, text: textEn, align: 'start', size: 'medium', background },
      },
    })),
    zones: {
      topLeft: {
        playlist: { he: 'תפריט — ראשונות', en: 'Menu — starters' },
        widgets: ['starters'],
      },
      topRight: { playlist: { he: 'תפריט — עיקריות', en: 'Menu — mains' }, widgets: ['mains'] },
      bottomLeft: {
        playlist: { he: 'תפריט — קינוחים', en: 'Menu — desserts' },
        widgets: ['desserts'],
      },
      bottomRight: { playlist: { he: 'תפריט — שתייה', en: 'Menu — drinks' }, widgets: ['drinks'] },
    },
  },
  {
    id: 'info',
    template: 'header-main-footer',
    name: { he: 'לוח מודעות', en: 'Notice board' },
    background: '#0f172a',
    widgets: [
      {
        key: 'title',
        type: 'text',
        name: { he: 'כותרת', en: 'Heading' },
        config: {
          he: { text: 'ברוכים הבאים', size: 'xlarge', background: '#312e81' },
          en: { text: 'Welcome', size: 'xlarge', background: '#312e81' },
        },
      },
      {
        key: 'notice',
        type: 'text',
        name: { he: 'הודעה', en: 'Notice' },
        config: {
          he: {
            title: 'הודעה חשובה',
            text: 'כאן אפשר לכתוב הודעה לקהל. ערכו אותה ב-Widgets › הודעה.',
            size: 'large',
            background: '#0f172a',
          },
          en: {
            title: 'Important notice',
            text: 'Write a message for your audience here. Edit it in Widgets › Notice.',
            size: 'large',
            background: '#0f172a',
          },
        },
      },
      {
        key: 'countdown',
        type: 'countdown',
        name: { he: 'ספירה לאחור', en: 'Countdown' },
        config: {
          he: { title: 'עד האירוע הבא', target: '', locale: 'he', background: '#1e1b4b' },
          en: { title: 'Until the next event', target: '', locale: 'en', background: '#1e1b4b' },
        },
      },
      {
        key: 'ticker',
        type: 'ticker',
        name: { he: 'פס עדכונים', en: 'Updates bar' },
        config: {
          he: {
            label: 'חדש',
            text: 'עדכנו את הפס הזה בכל רגע — המסכים מתעדכנים מיד',
            background: '#be123c',
          },
          en: {
            label: 'New',
            text: 'Update this bar anytime — screens refresh instantly',
            background: '#be123c',
          },
        },
      },
    ],
    zones: {
      header: { playlist: { he: 'לוח — כותרת', en: 'Board — heading' }, widgets: ['title'] },
      main: {
        playlist: { he: 'לוח — תוכן', en: 'Board — content' },
        widgets: ['notice', 'countdown'],
      },
      footer: { playlist: { he: 'לוח — עדכונים', en: 'Board — updates' }, widgets: ['ticker'] },
    },
  },
];

export const STARTER_KIT_IDS = STARTER_KITS.map((kit) => kit.id);

/** The countdown sample targets two weeks ahead (a date in the past would show "done"). */
export function sampleCountdownTarget(now = new Date()): string {
  const target = new Date(now.getTime() + 14 * 86_400_000);
  return `${target.toISOString().slice(0, 10)}T18:00`;
}
