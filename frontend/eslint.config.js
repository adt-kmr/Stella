import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dashboard']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The router module legitimately exports both a component (Link) and
      // the route table and navigation helper, and the reveal hook is a
      // hook rather than a component. Splitting them to satisfy a
      // fast-refresh hint would scatter one concern across two files for
      // no runtime gain, so the hint is off and the real rules stay on.
      'react-refresh/only-export-components': 'off',

      // The automatic JSX runtime means `React` need not be in scope, and
      // the compiler lint below wants it out of files that do not use it.
      'no-unused-vars': ['error', { varsIgnorePattern: '^React$' }],
    },
  },
  {
    // `Date.now()` inside a render-scoped useMemo is genuinely impure: two
    // renders in the same second can disagree, and the value is never
    // re-derived when the clock ticks. The chart window is time-dependent
    // data, so it belongs in state driven by an interval. This is not
    // silenced.
    files: ['**/*.{js,jsx}'],
    rules: {
      'react-hooks/purity': 'error',
    },
  },
])
