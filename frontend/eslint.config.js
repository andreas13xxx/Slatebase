import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'jsx-a11y-x': jsxA11y,
    },
    languageOptions: {
      globals: globals.browser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // jsx-a11y rules downgraded to warn for incremental adoption (R1.2):
      // These fire on existing code patterns that will be fixed in later tasks (R4).
      'jsx-a11y-x/click-events-have-key-events': 'warn',
      'jsx-a11y-x/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y-x/no-static-element-interactions': 'warn',
      'jsx-a11y-x/no-redundant-roles': 'warn',
      'jsx-a11y-x/interactive-supports-focus': 'warn',
      'jsx-a11y-x/no-autofocus': 'warn',
      'jsx-a11y-x/label-has-associated-control': 'warn',
      'jsx-a11y-x/no-noninteractive-tabindex': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
])
