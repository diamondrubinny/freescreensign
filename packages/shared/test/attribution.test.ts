// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: MIT
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION,
  ATTRIBUTION_BANNER,
  POWERED_BY_HEADER,
  attributionBundlePlugin,
  poweredBy,
} from '../src/attribution.js';

// The attribution must stay in every version (AGPL-3.0 section 7(b), LICENSING.md).
describe('the attribution', () => {
  it('reads "Powered by Rubinny · Open source", in Hebrew unless English', () => {
    expect(poweredBy('he')).toBe('מופעל על ידי Rubinny · קוד פתוח');
    expect(poweredBy('en')).toBe('Powered by Rubinny · Open source');
    expect(poweredBy('fr')).toBe(ATTRIBUTION.poweredBy.he);
  });

  it('names the creator, the license and the source code in one line', () => {
    for (const part of ['Powered by Rubinny · Open source', 'Diamond Rubinny', 'AGPL-3.0-only']) {
      expect(ATTRIBUTION_BANNER).toContain(part);
    }
    expect(ATTRIBUTION_BANNER).toContain('https://github.com/diamondrubinny/freescreensign');
    expect(POWERED_BY_HEADER).toBe('Rubinny (open source)');
  });

  it('puts the notice on built CSS and after the minification of JS', () => {
    const plugin = attributionBundlePlugin();
    expect(plugin.transform('a{}', '/src/app.css')).toBe(`/*! ${ATTRIBUTION_BANNER} */\na{}`);
    expect(plugin.transform('x', '/src/main.ts')).toBeNull();
    expect(plugin.transform('a{}', '/node_modules/x/y.css')).toBeNull();
    expect(plugin.outputOptions({ format: 'es' })).toEqual({
      format: 'es',
      postBanner: `/*! ${ATTRIBUTION_BANNER} */`,
    });
  });
});
