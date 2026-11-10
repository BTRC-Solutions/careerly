import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture rules for the API (ARCHITECTURE.md §4–5).
 * Module layout: apps/api/src/modules/<module>/{domain,application,infrastructure,http}
 * plus `<module>.module.ts` / `index.ts` at the module root (its public API).
 */
// Order matters: the first matching descriptor wins, so the most specific folders come first.
const API_ELEMENTS = [
  { type: 'domain', pattern: 'apps/api/src/modules/*/domain', capture: ['module'] },
  { type: 'application', pattern: 'apps/api/src/modules/*/application', capture: ['module'] },
  { type: 'infrastructure', pattern: 'apps/api/src/modules/*/infrastructure', capture: ['module'] },
  { type: 'http', pattern: 'apps/api/src/modules/*/http', capture: ['module'] },
  { type: 'module', pattern: 'apps/api/src/modules/*', capture: ['module'] },
  { type: 'platform', pattern: 'apps/api/src/platform/*', capture: ['name'] },
  { type: 'test-support', pattern: 'apps/api/src/test-support' },
  // Everything else directly under src/ (main.ts, server.ts, app.module.ts).
  { type: 'bootstrap', pattern: 'apps/api/src' },
].map((descriptor) => ({ ...descriptor, partialMatch: false }));

const sameModule = (...types) =>
  types.map((type) => ({
    to: { element: { type, captured: { module: '{{ from.element.captured.module }}' } } },
  }));

/** Frameworks and I/O that the domain layer must never depend on. */
const DOMAIN_FORBIDDEN_IMPORTS = [
  { group: ['@nestjs/*'], message: 'The domain layer must not depend on NestJS.' },
  {
    group: ['drizzle-orm', 'drizzle-orm/*'],
    message: 'The domain layer must not depend on the ORM.',
  },
  { group: ['@anthropic-ai/*'], message: 'The domain layer must not depend on the LLM SDK.' },
  {
    group: ['node:fs', 'node:fs/*', 'node:sqlite', 'node:child_process', 'node:net', 'node:http'],
    message: 'The domain layer must not do I/O; define a port instead.',
  },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/release/**', '**/node_modules/**', '.data/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },

  // Node code: API, Electron shell, config files.
  {
    files: ['apps/api/**/*.ts', 'apps/desktop/**/*.{ts,cts}', '*.{js,ts}', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // API: architecture boundaries.
  {
    files: ['apps/api/src/**/*.ts'],
    languageOptions: {
      // Nest DI needs runtime imports for constructor types; this keeps
      // consistent-type-imports from turning them into `import type`.
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': API_ELEMENTS,
      'boundaries/files': [{ pattern: '**/*.test.ts', category: 'test' }],
      // Resolves `./file.js` imports to the `.ts` sources so boundaries can classify them.
      'import/resolver': { typescript: { project: 'apps/api/tsconfig.json' } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { type: 'domain' } }, allow: sameModule('domain') },
            {
              from: { element: { type: 'application' } },
              allow: sameModule('domain', 'application'),
            },
            {
              from: { element: { type: 'infrastructure' } },
              allow: [
                ...sameModule('domain', 'application', 'infrastructure'),
                // Other modules only through their public API (module root).
                { to: { element: { type: 'module' } } },
                { to: { element: { type: 'platform' } } },
              ],
            },
            {
              from: { element: { type: 'http' } },
              allow: [
                ...sameModule('domain', 'application', 'http'),
                { to: { element: { type: 'platform' } } },
              ],
            },
            {
              from: { element: { type: 'module' } },
              allow: [
                ...sameModule('domain', 'application', 'infrastructure', 'http', 'module'),
                { to: { element: { type: 'platform' } } },
              ],
            },
            {
              from: { element: { type: 'platform' } },
              allow: [{ to: { element: { type: 'platform' } } }],
            },
            {
              from: { element: { type: 'bootstrap' } },
              allow: [{ to: { element: { types: ['module', 'platform', 'bootstrap'] } } }],
            },
            // Only test files may use the test helpers.
            {
              from: { file: { categories: 'test' } },
              allow: [{ to: { element: { type: 'test-support' } } }],
            },
            {
              from: { element: { type: 'test-support' } },
              allow: [
                { to: { element: { types: ['module', 'platform', 'bootstrap', 'test-support'] } } },
              ],
            },
          ],
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'The API must run outside Electron; receive what you need via config.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/*/domain/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: DOMAIN_FORBIDDEN_IMPORTS }] },
  },

  // UI (Electron renderer): browser only, React rules.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'Use src/shared/desktop.ts; the renderer has no Electron access.',
            },
          ],
          patterns: [{ group: ['node:*'], message: 'The renderer has no Node access.' }],
        },
      ],
    },
  },
);
