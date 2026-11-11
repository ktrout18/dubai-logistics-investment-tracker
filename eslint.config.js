import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'public/data', 'node_modules', 'research'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // shared/ must run in both the browser and Node: no Node built-ins, no DOM globals.
    files: ['shared/**/*.ts'],
    ignores: ['shared/**/*.test.ts', 'shared/__tests__/**'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', { patterns: ['node:*', 'fs', 'path', 'url', 'os', 'crypto', 'react', 'react-dom'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'process', 'Buffer', 'require', '__dirname', 'localStorage', 'fetch'],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
