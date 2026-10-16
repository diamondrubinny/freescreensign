import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ApiError } from './api/client';
import { setupI18n } from './i18n';
import { applyA11yPrefs, loadA11yPrefs } from './lib/a11y-prefs';
import { createRouter } from './router';
import './styles/app.css';
import { enableStrictCspValidation } from '@rubinny/shared';

enableStrictCspValidation();

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
