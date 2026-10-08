import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  ...baseConfig,
  {
    // The pieces of the docs that are the site's own — the author's note, the agent
    // prompt, the template migrator — are written with the design system only, like
    // the theme they stand on.
    files: ['**/src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.style.rules,
      ...craftRules.configs.a11y.rules,
      ...craftRules.configs.typedCss.rules,
      // A site sheet reads the theme from the docs theme's style entry: still
      // vocabulary only, which is what the rule protects.
      'craft-ts/style-file-boundary': [
        'error',
        { allow: ['@craft-ts/docs-ui/style'] },
      ],
    },
  },
  {
    // The build side reads files and the VitePress configuration of `apps/docs`, on
    // purpose, while the two sites are compared.
    files: ['**/src/server/**/*.ts', '**/*.config.ts', '**/preview.mjs'],
    rules: { '@nx/enforce-module-boundaries': 'off' },
  },
];
