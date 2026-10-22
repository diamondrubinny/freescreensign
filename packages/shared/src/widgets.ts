import { z } from 'zod';
import { designConfigSchema } from './design.js';

/**
 * Built-in widget types and their configuration schemas. Shared by the server
 * (validation on save), the CMS (forms) and the player (defensive parsing).
 */
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');
const httpsUrl = z.url({ protocol: /^https$/ }).max(2000);
const feedUrl = z.url({ protocol: /^https?$/ }).max(2000);

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const clockConfigSchema = z.object({
  format: z.enum(['24h', '12h']).default('24h'),
  showSeconds: z.boolean().default(false),
  showDate: z.boolean().default(true),
  showHebrewDate: z.boolean().default(true),
  /** Defaults to the screen's time zone when omitted. */
  timezone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').optional(),
  locale: z.enum(['he', 'en']).default('he'),
  textColor: color.default('#ffffff'),
  background: color.default('#000000'),
});

export const textConfigSchema = z.object({
  /** Optional heading shown above the text. */
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(1000),
  align: z.enum(['start', 'center', 'end']).default('center'),
  size: z.enum(['small', 'medium', 'large', 'xlarge']).default('large'),
  textColor: color.default('#ffffff'),
  background: color.default('#000000'),
});

export const tickerConfigSchema = z.object({
  /** Optional fixed badge at the start of the line (e.g. "Updates"). */
  label: z.string().trim().max(40).optional(),
  text: z.string().trim().min(1).max(500),
  speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  textColor: color.default('#ffffff'),
  background: color.default('#1d4ed8'),
});

export const qrConfigSchema = z.object({
  url: httpsUrl,
  label: z.string().trim().max(100).optional(),
  foreground: color.default('#000000'),
  background: color.default('#ffffff'),
});

export const rssConfigSchema = z.object({
  url: feedUrl,
  maxItems: z.number().int().min(1).max(20).default(5),
  itemDurationMs: z.number().int().min(3000).max(60_000).default(8000),
  showSource: z.boolean().default(true),
  textColor: color.default('#ffffff'),
  background: color.default('#111827'),
});

export const weatherConfigSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationName: z.string().trim().min(1).max(100),
  units: z.enum(['metric', 'imperial']).default('metric'),
  days: z.number().int().min(0).max(5).default(3),
  locale: z.enum(['he', 'en']).default('he'),
  textColor: color.default('#ffffff'),
  background: color.default('#0c4a6e'),
});

export const webpageConfigSchema = z.object({
  url: httpsUrl,
  /** 0 = never reload. */
  refreshMinutes: z.number().int().min(0).max(1440).default(0),
});

/** Local date-time without a zone, e.g. 2026-12-14T18:00 (interpreted in `timezone`). */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Expected YYYY-MM-DDTHH:MM');

export const countdownConfigSchema = z.object({
  title: z.string().trim().min(1).max(200),
  target: localDateTime,
  /** Defaults to the screen's time zone when omitted. */
  timezone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').optional(),
  /** Shown once the target time has passed. */
  doneText: z.string().trim().max(200).optional(),
  showSeconds: z.boolean().default(true),
  locale: z.enum(['he', 'en']).default('he'),
  textColor: color.default('#ffffff'),
  background: color.default('#312e81'),
});

/** Dot path to an array inside a JSON document, e.g. "data.items" (at most 10 levels). */
const jsonPath = z
  .string()
  .trim()
  .max(200)
  .regex(/^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+){0,9}$/, 'Expected a dot path, e.g. data.items');

export const tableConfigSchema = z.object({
  source: z.enum(['csv', 'json']).default('csv'),
  url: feedUrl,
  /** JSON only: where the array is. Empty = the document itself. */
  jsonPath: jsonPath.optional(),
  /** CSV only: the first row holds the column names. */
  hasHeader: z.boolean().default(true),
  /** Comma-separated column names to show, in order. Empty = all columns. */
  columns: z.string().trim().max(500).optional(),
  title: z.string().trim().max(200).optional(),
  rowsPerPage: z.number().int().min(1).max(20).default(8),
  pageDurationMs: z.number().int().min(3000).max(60_000).default(10_000),
  maxRows: z.number().int().min(1).max(200).default(50),
  refreshMinutes: z.number().int().min(1).max(1440).default(5),
  locale: z.enum(['he', 'en']).default('he'),
  textColor: color.default('#f8fafc'),
  background: color.default('#0f172a'),
  accent: color.default('#1d4ed8'),
});

export const MENU_TAGS = [
  'vegan',
  'vegetarian',
  'spicy',
  'gluten-free',
  'new',
  'recommended',
] as const;
export type MenuTag = (typeof MENU_TAGS)[number];
/** Tag names shown on screens (the player has no translation files). */
export const MENU_TAG_LABELS: Record<'he' | 'en', Record<MenuTag, string>> = {
  he: {
    vegan: 'טבעוני',
    vegetarian: 'צמחוני',
    spicy: 'חריף',
    'gluten-free': 'ללא גלוטן',
    new: 'חדש',
    recommended: 'מומלץ',
  },
  en: {
    vegan: 'Vegan',
    vegetarian: 'Vegetarian',
    spicy: 'Spicy',
    'gluten-free': 'Gluten free',
    new: 'New',
    recommended: 'Recommended',
  },
};
export const MENU_CURRENCIES = ['none', 'ILS', 'USD', 'EUR', 'GBP'] as const;
export const MENU_MAX_ITEMS = 80;

const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  /** A number is shown as a price in the menu's currency; other text as is (e.g. "17:30 · 20:00"). */
  price: z.string().trim().max(40).optional(),
  tags: z.array(z.enum(MENU_TAGS)).max(4).default([]),
});

/** A menu or price list: sections of items, laid out in columns and sized to fit the zone. */
export const menuConfigSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    subtitle: z.string().trim().max(200).optional(),
    sections: z
      .array(
        z.object({
          title: z.string().trim().max(80).default(''),
          items: z.array(menuItemSchema).max(40).default([]),
        }),
      )
      .min(1)
      .max(8),
    columns: z.number().int().min(1).max(3).default(2),
    style: z.enum(['modern', 'classic', 'chalkboard']).default('modern'),
    currency: z.enum(MENU_CURRENCIES).default('ILS'),
    locale: z.enum(['he', 'en']).default('he'),
    textColor: color.default('#fdf6ec'),
    background: color.default('#1c1917'),
    accent: color.default('#d4a373'),
  })
  .refine(
    (menu) =>
      menu.sections.reduce((count, section) => count + section.items.length, 0) <= MENU_MAX_ITEMS,
    { message: `At most ${String(MENU_MAX_ITEMS)} items`, path: ['sections'] },
  );

/**
 * A menu price for display: "42" or "42.5" becomes "₪42" / "$42.50" in the menu's language;
 * anything else (times, "market price") is shown as written.
 */
export function formatMenuPrice(
  price: string | undefined,
  currency: (typeof MENU_CURRENCIES)[number],
  locale: 'he' | 'en',
): string {
  const text = price?.trim() ?? '';
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text) || currency === 'none') return text;
  const value = Number(text);
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export const WIDGET_CONFIG_SCHEMAS = {
  clock: clockConfigSchema,
  text: textConfigSchema,
  ticker: tickerConfigSchema,
  qr: qrConfigSchema,
  rss: rssConfigSchema,
  weather: weatherConfigSchema,
  webpage: webpageConfigSchema,
  countdown: countdownConfigSchema,
  table: tableConfigSchema,
  menu: menuConfigSchema,
  design: designConfigSchema,
} as const;

export type WidgetType = keyof typeof WIDGET_CONFIG_SCHEMAS;
export const WIDGET_TYPES = Object.keys(WIDGET_CONFIG_SCHEMAS) as WidgetType[];
export type WidgetConfig<T extends WidgetType> = z.infer<(typeof WIDGET_CONFIG_SCHEMAS)[T]>;

/** Widget types whose content is fetched by the server (never by the player directly). */
export const DATA_WIDGET_TYPES = [
  'rss',
  'weather',
  'table',
] as const satisfies readonly WidgetType[];

export function isWidgetType(value: string): value is WidgetType {
  return value in WIDGET_CONFIG_SCHEMAS;
}

export type WidgetConfigResult =
  | { success: true; config: Record<string, unknown> }
  | { success: false; issues: { path: string; message: string }[] };

/** Validates (and fills defaults for) a widget configuration. Never throws. */
export function parseWidgetConfig(type: string, config: unknown): WidgetConfigResult {
  if (!isWidgetType(type))
    return { success: false, issues: [{ path: 'type', message: 'Unknown widget type' }] };
  const result = WIDGET_CONFIG_SCHEMAS[type].safeParse(config);
  if (result.success) return { success: true, config: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

// ---- Data returned by GET .../widgets/:id/data --------------------------------

export interface RssData {
  title: string | null;
  items: { title: string; published: string | null }[];
}

export interface WeatherData {
  units: 'metric' | 'imperial';
  current: { temperature: number; weatherCode: number };
  daily: { date: string; min: number; max: number; weatherCode: number }[];
  attribution: string;
}

export interface TableData {
  columns: string[];
  rows: string[][];
  /** True when the source had more rows than `maxRows`. */
  truncated: boolean;
}
