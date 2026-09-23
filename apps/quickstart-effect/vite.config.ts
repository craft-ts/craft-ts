/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/quickstart-effect',
  plugins: [
    craftStyle({
      // TODO(style-only): the app is not migrated yet, so the foundation stays
      // off — turning the reset on would move every margin of the legacy CSS.
      // What the plugin emits today is the sheets of @craft-ts/component (the
      // AI overlay, the pending indicator, the skip link).
      reset: false,
      base: false,
      include: [path.resolve(root, '../../libs/component/src')],
      alias: {
        '@craft-ts/style': path.resolve(root, '../../libs/style/src/index.ts'),
        '@craft-ts/core': path.resolve(root, '../../libs/core/src/index.ts'),
        '@craft-ts/component': path.resolve(
          root,
          '../../libs/component/src/index.ts',
        ),
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 4202,
    forwardConsole: true,
    fs: { allow: [path.resolve(root, '../..')] },
  },
  build: craftProductionBuildOptions(
    path.resolve(root, '../../dist/apps/quickstart-effect'),
  ),
});
