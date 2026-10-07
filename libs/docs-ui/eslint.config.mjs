import baseConfig from '../../eslint.config.mjs';
import craftRules from '../dev-tools/src/eslint-rules/index.cjs';

/**
 * The docs components are written with the design system and nothing else, so
 * the three presets that police that apply to everything authored under `src`:
 * `style` (no raw CSS value, class, inline style, `:has()`, and the boundary of
 * a `*.style.ts`), `a11y` (a control has a name and a type, an image an `alt`)
 * and `typedCss` (hover is an axis, text colour is modelled).
 *
 * Specs and the preview harness are executable boundaries of their own.
 */
export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.style.rules,
      ...craftRules.configs.a11y.rules,
      ...craftRules.configs.typedCss.rules,
    },
  },
];
