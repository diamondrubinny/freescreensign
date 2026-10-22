// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Footer } from '../src/components/Footer';
import { changeLocale } from '../src/i18n';
import { AboutPage } from '../src/pages/AboutPage';
import { renderRoutes } from './render';

const SOURCE = 'https://github.com/diamondrubinny/freescreensign';

afterEach(async () => {
  await changeLocale('he');
});

// The attribution must stay in every version (AGPL-3.0 section 7(b), LICENSING.md).
describe('the attribution', () => {
  it('is in the footer of every page, in Hebrew, with the source code and the creator', () => {
    renderRoutes([{ path: '/', element: <Footer /> }], '/');
    const credit = screen.getByTestId('powered-by');
    expect(credit).toHaveTextContent('מופעל על ידי Rubinny · קוד פתוח');
    expect(credit).toHaveTextContent('AGPL-3.0');
    expect(screen.getByRole('link', { name: 'מופעל על ידי Rubinny · קוד פתוח' })).toHaveAttribute(
      'href',
      SOURCE,
    );
    expect(screen.getByTestId('created-by')).toHaveTextContent('Diamond Rubinny');
    expect(screen.getByRole('link', { name: 'אודות' })).toHaveAttribute('href', '/about');
  });

  it('is in English for English readers', async () => {
    await changeLocale('en');
    renderRoutes([{ path: '/', element: <Footer /> }], '/');
    expect(screen.getByTestId('powered-by')).toHaveTextContent('Powered by Rubinny · Open source');
  });

  it('has an About page with the version, the license and the source code', () => {
    renderRoutes([{ path: '/about', element: <AboutPage /> }], '/about');
    expect(screen.getByRole('heading', { level: 1, name: 'אודות Rubinny' })).toBeVisible();
    expect(screen.getByTestId('about-powered-by')).toHaveTextContent(
      'מופעל על ידי Rubinny · קוד פתוח',
    );
    expect(screen.getByText(/^\d+\.\d+\.\d+$/)).toBeVisible();
    expect(screen.getByText(/GNU AGPL-3.0/)).toBeVisible();
    expect(screen.getByRole('link', { name: SOURCE.replace('https://', '') })).toHaveAttribute(
      'href',
      SOURCE,
    );
    expect(screen.getByText('Diamond Rubinny')).toBeVisible();
  });
});
