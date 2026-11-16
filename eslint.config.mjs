import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, chrome: 'readonly' } },
  },
  {
    files: ['src/content.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['tests/**/*.js', 'store/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
