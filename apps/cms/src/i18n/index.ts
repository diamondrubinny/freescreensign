import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, isSupportedLocale, textDirection, type Locale } from '@rubinny/shared';
import { he } from './locales/he';
import { en } from './locales/en';
import { readPreference, writePreference } from '../lib/storage';

const LOCALE_KEY = 'rubinny.locale';

function initialLocale(): Locale {
  const stored = readPreference(LOCALE_KEY);
  if (stored && isSupportedLocale(stored)) return stored;
  const browser = navigator.language.split('-')[0] ?? '';
  return isSupportedLocale(browser) ? browser : DEFAULT_LOCALE;
}

/** Keeps <html lang/dir> in sync so screen readers and layout follow the language. */
function applyDocumentLocale(locale: string) {
  document.documentElement.lang = locale;
  document.documentElement.dir = textDirection(locale);
}

export async function setupI18n(locale: Locale = initialLocale()) {
  await i18n.use(initReactI18next).init({
    resources: { he: { translation: he }, en: { translation: en } },
    lng: locale,
    fallbackLng: 'he',
    interpolation: { escapeValue: false }, // React already escapes output
    returnNull: false,
  });
  applyDocumentLocale(locale);
  i18n.on('languageChanged', applyDocumentLocale);
  return i18n;
}

export function changeLocale(locale: Locale) {
  writePreference(LOCALE_KEY, locale);
  return i18n.changeLanguage(locale);
}

export { i18n };
