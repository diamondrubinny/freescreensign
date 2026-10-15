import { WIDGET_CONFIG_SCHEMAS, type WidgetType } from '@rubinny/shared';
import type { Messages } from '../i18n/locales/he';

type FieldLabel = keyof Messages['widgets']['fields'];

/** Declarative form fields per widget type; validation itself happens on the server. */
export type WidgetFieldSpec = { key: string; label: FieldLabel; hint?: FieldLabel } & (
  | { kind: 'text' | 'url' | 'textarea'; required?: boolean; maxLength: number; ltr?: boolean }
  | {
      kind: 'number';
      min: number;
      max: number;
      step: number | 'any';
      required?: boolean;
      scale?: number;
    }
  | { kind: 'checkbox' }
  | { kind: 'select'; options: { value: string; label: FieldLabel }[] }
  | { kind: 'color' }
);

const colors = (text: 'textColor' | 'foreground' = 'textColor'): WidgetFieldSpec[] => [
  { key: text, label: text, kind: 'color' },
  { key: 'background', label: 'background', kind: 'color' },
];

const locale: WidgetFieldSpec = {
  key: 'locale',
  label: 'locale',
  kind: 'select',
  options: [
    { value: 'he', label: 'localeHe' },
    { value: 'en', label: 'localeEn' },
  ],
};

export const WIDGET_FIELDS: Record<WidgetType, WidgetFieldSpec[]> = {
  clock: [
    {
      key: 'format',
      label: 'format',
      kind: 'select',
      options: [
        { value: '24h', label: 'format24' },
        { value: '12h', label: 'format12' },
      ],
    },
    { key: 'showSeconds', label: 'showSeconds', kind: 'checkbox' },
    { key: 'showDate', label: 'showDate', kind: 'checkbox' },
    { key: 'showHebrewDate', label: 'showHebrewDate', kind: 'checkbox' },
    {
      key: 'timezone',
      label: 'timezone',
      hint: 'timezoneHint',
      kind: 'text',
      maxLength: 64,
      ltr: true,
    },
    locale,
    ...colors(),
  ],
  text: [
    { key: 'text', label: 'text', kind: 'textarea', required: true, maxLength: 1000 },
    {
      key: 'align',
      label: 'align',
      kind: 'select',
      options: [
        { value: 'start', label: 'alignStart' },
        { value: 'center', label: 'alignCenter' },
        { value: 'end', label: 'alignEnd' },
      ],
    },
    {
      key: 'size',
      label: 'size',
      kind: 'select',
      options: [
        { value: 'small', label: 'sizeSmall' },
        { value: 'medium', label: 'sizeMedium' },
        { value: 'large', label: 'sizeLarge' },
        { value: 'xlarge', label: 'sizeXlarge' },
      ],
    },
    ...colors(),
  ],
  ticker: [
    { key: 'text', label: 'text', kind: 'textarea', required: true, maxLength: 500 },
    {
      key: 'speed',
      label: 'speed',
      kind: 'select',
      options: [
        { value: 'slow', label: 'speedSlow' },
        { value: 'normal', label: 'speedNormal' },
        { value: 'fast', label: 'speedFast' },
      ],
    },
    ...colors(),
  ],
  qr: [
    {
      key: 'url',
      label: 'url',
      hint: 'httpsHint',
      kind: 'url',
      required: true,
      maxLength: 2000,
      ltr: true,
    },
    { key: 'label', label: 'label', kind: 'text', maxLength: 100 },
    ...colors('foreground'),
  ],
  rss: [
    { key: 'url', label: 'feedUrl', kind: 'url', required: true, maxLength: 2000, ltr: true },
    { key: 'maxItems', label: 'maxItems', kind: 'number', min: 1, max: 20, step: 1 },
    {
      key: 'itemDurationMs',
      label: 'itemSeconds',
      kind: 'number',
      min: 3,
      max: 60,
      step: 1,
      scale: 1000,
    },
    { key: 'showSource', label: 'showSource', kind: 'checkbox' },
    ...colors(),
  ],
  weather: [
    { key: 'locationName', label: 'locationName', kind: 'text', required: true, maxLength: 100 },
    {
      key: 'latitude',
      label: 'latitude',
      hint: 'coordinatesHint',
      kind: 'number',
      min: -90,
      max: 90,
      step: 'any',
      required: true,
    },
    {
      key: 'longitude',
      label: 'longitude',
      kind: 'number',
      min: -180,
      max: 180,
      step: 'any',
      required: true,
    },
    {
      key: 'units',
      label: 'units',
      kind: 'select',
      options: [
        { value: 'metric', label: 'unitsMetric' },
        { value: 'imperial', label: 'unitsImperial' },
      ],
    },
    { key: 'days', label: 'days', kind: 'number', min: 0, max: 5, step: 1 },
    locale,
    ...colors(),
  ],
  webpage: [
    {
      key: 'url',
      label: 'url',
      hint: 'webpageHint',
      kind: 'url',
      required: true,
      maxLength: 2000,
      ltr: true,
    },
    { key: 'refreshMinutes', label: 'refreshMinutes', kind: 'number', min: 0, max: 1440, step: 1 },
  ],
};

/** Default values from the shared schemas (fields without a default stay empty). */
export function widgetDefaults(type: WidgetType): Record<string, unknown> {
  const shape = WIDGET_CONFIG_SCHEMAS[type].shape as Record<
    string,
    { safeParse(v: unknown): { success: boolean; data?: unknown } }
  >;
  const defaults: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(shape)) {
    const result = schema.safeParse(undefined);
    if (result.success && result.data !== undefined) defaults[key] = result.data;
  }
  return defaults;
}

/** Reads a widget configuration from the form. Empty optional values are omitted. */
export function readWidgetConfig(type: WidgetType, data: FormData): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of WIDGET_FIELDS[type]) {
    if (field.kind === 'checkbox') {
      config[field.key] = data.has(field.key);
      continue;
    }
    const raw = data.get(field.key);
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '') continue;
    if (field.kind === 'number') {
      const number = Number(text);
      config[field.key] = Number.isFinite(number) ? number * (field.scale ?? 1) : text;
    } else {
      config[field.key] = field.kind === 'color' ? text.toLowerCase() : text;
    }
  }
  return config;
}
