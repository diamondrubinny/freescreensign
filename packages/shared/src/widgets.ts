import { z } from 'zod';

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
  text: z.string().trim().min(1).max(1000),
  align: z.enum(['start', 'center', 'end']).default('center'),
  size: z.enum(['small', 'medium', 'large', 'xlarge']).default('large'),
  textColor: color.default('#ffffff'),
  background: color.default('#000000'),
});

export const tickerConfigSchema = z.object({
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

export const WIDGET_CONFIG_SCHEMAS = {
  clock: clockConfigSchema,
  text: textConfigSchema,
  ticker: tickerConfigSchema,
  qr: qrConfigSchema,
  rss: rssConfigSchema,
  weather: weatherConfigSchema,
  webpage: webpageConfigSchema,
} as const;

export type WidgetType = keyof typeof WIDGET_CONFIG_SCHEMAS;
export const WIDGET_TYPES = Object.keys(WIDGET_CONFIG_SCHEMAS) as WidgetType[];
export type WidgetConfig<T extends WidgetType> = z.infer<(typeof WIDGET_CONFIG_SCHEMAS)[T]>;

/** Widget types whose content is fetched by the server (never by the player directly). */
export const DATA_WIDGET_TYPES = ['rss', 'weather'] as const satisfies readonly WidgetType[];

export function isWidgetType(value: string): value is WidgetType {
  return value in WIDGET_CONFIG_SCHEMAS;
}

export type WidgetConfigResult =
  | { success: true; config: Record<string, unknown> }
  | { success: false; issues: { path: string; message: string }[] };

/** Validates (and fills defaults for) a widget configuration. Never throws. */
export function parseWidgetConfig(type: string, config: unknown): WidgetConfigResult {
  if (!isWidgetType(type)) return { success: false, issues: [{ path: 'type', message: 'Unknown widget type' }] };
  const result = WIDGET_CONFIG_SCHEMAS[type].safeParse(config);
  if (result.success) return { success: true, config: result.data };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
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
