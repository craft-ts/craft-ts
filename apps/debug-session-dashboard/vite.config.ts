/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/debug-session-dashboard',
  plugins: [
    craftStyle({
      // The Herbier sheets live in libs/ui; the framework's own components
      // (AI overlay, pending indicator) in libs/component.
      include: [
        path.resolve(root, '../../libs/component/src'),
        path.resolve(root, '../../libs/ui/src'),
      ],
      alias: {
        '@craft-ts/style': path.resolve(root, '../../libs/style/src/index.ts'),
        '@craft-ts/core': path.resolve(root, '../../libs/core/src/index.ts'),
        '@craft-ts/ui/style': path.resolve(root, '../../libs/ui/src/style.ts'),
        // Before the package itself: an alias matches by prefix.
        '@craft-ts/component/style': path.resolve(
          root,
          '../../libs/component/src/style.ts',
        ),
        '@craft-ts/component': path.resolve(
          root,
          '../../libs/component/src/index.ts',
        ),
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.resolve(root, '../../libs/core/src/index.ts'),
      '@craft-ts/ui/style': path.resolve(root, '../../libs/ui/src/style.ts'),
      '@craft-ts/ui': path.resolve(root, '../../libs/ui/src/index.ts'),
      '@craft-ts/component/style': path.resolve(
        root,
        '../../libs/component/src/style.ts',
      ),
      '@craft-ts/component': path.resolve(
        root,
        '../../libs/component/src/index.ts',
      ),
      '@craft-ts/style': path.resolve(root, '../../libs/style/src/index.ts'),
    },
  },
  server: {
    port: Number(process.env['CRAFT_DASHBOARD_PORT'] ?? '4210'),
    strictPort: true,
    fs: { allow: [path.resolve(root, '../..')] },
  },
  build: craftProductionBuildOptions(
    path.resolve(root, '../../dist/apps/debug-session-dashboard'),
  ),
});
