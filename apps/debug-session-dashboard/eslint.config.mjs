import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

const parserOptions = {
  project: ['./tsconfig.app.json'],
  tsconfigRootDir: import.meta.dirname,
};

export default [
  { ignores: ['**/architecture/catalog.ts'] },
  ...baseConfig,
  {
    // The dashboard is styled with the design system and nothing else: the
    // `style` preset (no raw class, no inline style, no raw CSS value, the
    // boundary of a `*.style.ts`), then `a11y` and `typedCss`. They apply to
    // every file authored under `src`, the sheet included.
    files: ['**/src/**/*.ts'],
    ignores: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    languageOptions: { parserOptions },
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.security.rules,
      ...craftRules.configs.style.rules,
      ...craftRules.configs.a11y.rules,
      ...craftRules.configs.typedCss.rules,
    },
  },
  {
    // The rest of `recommended` describes authored Craft code, not a sheet:
    // `as const` on an axis is how the sheets of `libs/ui` are written too.
    files: ['**/src/**/*.ts'],
    ignores: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts', '**/*.style.ts'],
    languageOptions: { parserOptions },
    plugins: { 'craft-ts': craftRules },
    rules: { ...craftRules.configs.recommended.rules },
  },
  {
    // TODO(replay-engine): `dashboard.ts` still holds the replay engine (the
    // postMessage handshake with the replayed page, the archive HTTP calls, the
    // DOM frames) in the same file as the view. Those parts are protocol and
    // browser boundaries, not Craft state, so the rules that describe authored
    // Craft code do not fit them yet. Splitting the engine out of the view and
    // moving the archive onto a craftService is what retires this block.
    // The design-system rules above stay on for the whole file.
    files: ['**/src/dashboard.ts'],
    rules: {
      'craft-ts/prefer-browser-boundaries': 'off',
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-craft-http-transport': 'off',
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/no-type-assertions-in-craft-code': 'off',
      'craft-ts/max-craft-component-lines': 'off',
      'craft-ts/require-direct-craft-component-template': 'off',
      'craft-ts/prefer-deep-yieldable-for-item': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
