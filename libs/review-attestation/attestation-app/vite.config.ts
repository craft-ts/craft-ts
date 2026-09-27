import { resolve } from 'node:path';
import { defineConfig } from 'vite';
// Vite loads this config with Node before workspace aliases are available.
// The generated app template uses the same source-path import for its plugin.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { craftStyle } from '../../style/src/plugin/vite.ts';

const root = import.meta.dirname;
const aliases = {
  '@craft-ts/core': resolve(root, '../../core/src/index.ts'),
  '@craft-ts/component': resolve(root, '../../component/src/index.ts'),
  '@craft-ts/style': resolve(root, '../../style/src/index.ts'),
  '@craft-ts/style-testing/review/frame': resolve(
    root,
    '../src/lib/review/frame.ts',
  ),
  '@craft-ts/style-testing/review': resolve(
    root,
    '../src/lib/review/index.ts',
  ),
  '@craft-ts/style-testing': resolve(root, '../src/index.ts'),
  '@craft-ts/dev-tools/attestation-review': resolve(
    root,
    '../../dev-tools/src/attestation-review.ts',
  ),
};

export default defineConfig({
  root,
  resolve: { alias: aliases },
  plugins: [
    craftStyle({
      dumpPath: resolve(root, '../../../.craft/review-app-style-graph.json'),
      // The sheets of the framework's own components, outside the app root.
      include: [resolve(root, '../../component/src')],
      alias: aliases,
    }),
  ],
  build: {
    outDir: resolve(root, '../../../dist/review-attestation-app'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
