// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ApiError } from './api/client';
import { setupI18n } from './i18n';
import { applyA11yPrefs, loadA11yPrefs } from './lib/a11y-prefs';
import { createRouter } from './router';
import './styles/app.css';
import { ATTRIBUTION_BANNER, enableStrictCspValidation } from '@rubinny/shared';

enableStrictCspValidation();
// The attribution, for anyone who opens the developer tools (LICENSING.md).
// eslint-disable-next-line no-console
console.info(ATTRIBUTION_BANNER);

applyA11yPrefs(loadA11yPrefs());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Do not retry client errors (401/403/404…); retry transient failures once.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

await setupI18n();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createRouter()} />
    </QueryClientProvider>
  </StrictMode>,
);
