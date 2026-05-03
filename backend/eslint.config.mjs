// Flat ESLint config — rules act as the structural guard for the refactor.
// max-lines / no-cycle currently `warn`; flip to `error` after Faz 2 + Faz 3 land.
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
      // Refactor guards — flip severity after the matching faz lands.
      'max-lines': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: false },
      ],
      // Now an error: the accounts ↔ x-automation cycle was killed by the
      // PROFILE_FETCHER port. Any new circular import is structural drift.
      'import/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }],

      // Recommended-but-noisy rules: relaxed during refactor; revisit after.
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
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
);
