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
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
