// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

/**
 * The attribution of Rubinny: one source for every place that shows it (the dashboard, the
 * player's pairing and idle screens, the apps, the server's headers, the built bundles).
 * Keeping it is a term of the license (AGPL-3.0 section 7(b), see LICENSING.md).
 */
export const ATTRIBUTION = {
  name: 'Rubinny',
  description: 'Free and open-source digital signage',
  poweredBy: {
    he: 'מופעל על ידי Rubinny · קוד פתוח',
    en: 'Powered by Rubinny · Open source',
  },
  author: 'Diamond Rubinny',
  copyright: 'Copyright (C) 2026 The Rubinny Authors',
  license: 'AGPL-3.0-only',
  sourceUrl: 'https://github.com/diamondrubinny/freescreensign',
} as const;

/** The credit in the given language (Hebrew unless English). */
export function poweredBy(locale: string): string {
  return locale === 'en' ? ATTRIBUTION.poweredBy.en : ATTRIBUTION.poweredBy.he;
}

/** One line for built files, the browser console and logs. */
export const ATTRIBUTION_BANNER =
  `${ATTRIBUTION.name} — ${ATTRIBUTION.description.toLowerCase()}. ` +
  `${ATTRIBUTION.poweredBy.en}. ${ATTRIBUTION.copyright}. ` +
  `Created by ${ATTRIBUTION.author}. ${ATTRIBUTION.license}: ${ATTRIBUTION.sourceUrl}`;

/** Value of the X-Powered-By header (no version, so it tells attackers nothing). */
export const POWERED_BY_HEADER = 'Rubinny (open source)';

/**
 * A Vite plugin that puts the attribution at the top of every built JS and CSS file. It is a
 * `/*!` comment, which minifiers treat as a license notice and keep.
 */
export function attributionBundlePlugin() {
  const banner = `/*! ${ATTRIBUTION_BANNER} */`;
  return {
    name: 'rubinny-attribution',
    // CSS: before minification, which keeps `/*!` comments.
    transform(code: string, id: string) {
      return /\.css($|\?)/.test(id) && !id.includes('node_modules') ? `${banner}\n${code}` : null;
    },
    // JS: after minification (Rolldown's postBanner), so the minifier cannot drop it.
    outputOptions(options: Record<string, unknown>) {
      return { ...options, postBanner: banner };
    },
  };
}
