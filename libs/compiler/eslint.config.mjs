import baseConfig from '../../eslint.config.mjs';
export default [
  ...baseConfig,
  {
    files: ['**/src/runtime.spec.ts'],
    rules: {
      // Integration tests intentionally exercise the renderer's private mount,
      // injector and plan-registration seam; none of these are production imports.
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
