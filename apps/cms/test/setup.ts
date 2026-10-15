import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setupI18n } from '../src/i18n';

await setupI18n('he');

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
