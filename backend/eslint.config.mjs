// Flat ESLint config — rules act as the structural guard for the refactor.
// max-lines / max-lines-per-function are now `error` (Faz 2-4 landed; the
// remaining bulky files are CLI scripts and TypeORM migrations, both of
// which are exempted below where the size is structurally unavoidable).
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'data/**',
      'user-data/**',
      'coverage/**',
      'node_modules/**',
      'scripts/codemod-paths.mjs',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    plugins: { import: importPlugin },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.eslint.json' },
        node: true,
      },
    },
    rules: {
      // Structural guards — kept at `error` so size regressions block CI
      // instead of accumulating quietly.
      'max-lines': [
        'error',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'error',
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: false },
      ],
      // Now an error: the accounts ↔ x-automation cycle was killed by the
      // PROFILE_FETCHER port. Any new circular import is structural drift.
      'import/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }],

      // DIP guard: service code must read env via AppConfigService, not by
      // touching process.env directly. The override blocks below allowlist
      // config/, main.ts, app.module.ts, observability/logger.module.ts,
      // scripts/, migrations, and tests — where direct access is
      // structurally appropriate (bootstrap / standalone tools / testing).
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            'Direct process.env reads are banned in service code. Inject AppConfigService (config/app-config.service.ts) and use getString/getNumber/getBoolean.',
        },
      ],

      // Recommended-but-noisy rules: relaxed during refactor; revisit after.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/public-api/**'],
              message:
                'public-api is a transport adapter. Move shared logic into a feature application service instead of importing public-api.',
            },
            {
              group: ['@/admin-api/admin-api.service'],
              message:
                'admin-api is a transport adapter. Use action-engine application services for shared queue/action operations.',
            },
            {
              group: ['@/x-automation/x-automation.module'],
              message:
                'XAutomationModule is app-level composition. Import XBrowserModule, XDirectModule, or XLoginModule from the focused submodule instead.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/public-api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/x-automation/x-automation.module'],
              message:
                'XAutomationModule is app-level composition. Import XBrowserModule, XDirectModule, or XLoginModule from the focused submodule instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      // Tests legitimately set process.env to exercise env-dependent code
      // paths; forcing every spec to thread an AppConfigService mock is
      // heavier than the value.
      'no-restricted-syntax': 'off',
    },
  },
  {
    // CLI scripts (one-shot migration / smoke / standalone tools) and TypeORM
    // migration files structurally outgrow the per-function and per-file caps:
    // they're flat top-to-bottom procedural scripts, not modules. Exempt them
    // rather than degrade the rule for everyone.
    files: ['src/scripts/**/*.ts', 'src/persistence/migrations/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Bootstrap, observability, and the env-parser layer itself read
    // process.env directly — they're the boundary that everything else
    // routes through.
    files: [
      'src/main.ts',
      'src/config/**/*.ts',
      'src/observability/logger.module.ts',
      'src/observability/health.controller.ts',
      'src/app.module.ts',
      'src/test/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
