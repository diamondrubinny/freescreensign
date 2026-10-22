// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The attribution must stay in every version (AGPL-3.0 section 7(b), LICENSING.md).
describe('the attribution', () => {
  it('is on the setup screen, in Hebrew and English, with the source code', () => {
    const html = readFileSync(new URL('../static/setup.html', import.meta.url), 'utf8');
    expect(html).toContain('data-testid="attribution"');
    expect(html).toContain('מופעל על ידי Rubinny · קוד פתוח');
    expect(html).toContain('Powered by Rubinny · Open source');
    expect(html).toContain('github.com/diamondrubinny/freescreensign');
  });

  it('is in the About panel', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/setAboutPanelOptions\(\{[^}]*Powered by Rubinny · Open source/);
  });
});
