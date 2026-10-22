// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/release/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', '*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
    },
  },
  {
    files: ['apps/cms/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      // Raw HTML injection is never allowed in the CMS (XSS); see docs/phases/02b-cms.md.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden (XSS risk).',
        },
      ],
    },
  },
  {
    files: ['**/test/**/*.{ts,tsx}', '**/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: ['apps/player/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['apps/player/**/*.ts', 'apps/tv/src/**/*.ts', 'apps/tv/test/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Showcase: the kit page and the callbacks the screenshot script runs in the page.
    files: ['apps/showcase/src/**/*.{ts,mjs}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Desktop: the preload and the bundled setup page run in the browser context.
    files: [
      'apps/desktop/src/preload.cts',
      'apps/desktop/static/**/*.js',
      'apps/desktop/e2e/**/*.ts',
    ],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
