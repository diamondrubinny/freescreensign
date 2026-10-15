export const SUPPORTED_LOCALES = ['he', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'he';

const RTL_LANGUAGES = new Set(['he', 'ar', 'fa', 'ur', 'yi']);

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Text direction for a BCP 47 tag (only the primary language subtag is considered). */
export function textDirection(locale: string): 'rtl' | 'ltr' {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? '';
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}
