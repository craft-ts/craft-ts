/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import { resolve as resolvePath } from 'node:path';
import { craftStyle } from '@craft-ts/style/vite';
import { craftTextLoaderPlugin } from './vite-text-loader-plugin.mjs';

// The design system is a library of the monorepo, copied next to the examples at
// the same `libs/ui/src` path by the release (`syncUiLibrary`). The subpath comes
// first: an alias matches by prefix.
const ui = {
  '@craft-ts/ui/style': resolvePath(import.meta.dirname, 'libs/ui/src/style.ts'),
  '@craft-ts/ui': resolvePath(import.meta.dirname, 'libs/ui/src/index.ts'),
};

export default defineConfig({
  plugins: [
    craftTextLoaderPlugin(),
    craftStyle({
      alias: {
        '@craft-ts/style': resolvePath(
          import.meta.dirname,
          'node_modules/@craft-ts/style/src/index.js',
        ),
        ...ui,
      },
    }),
  ],
  resolve: {
    alias: ui,
  },
  server: {
    port: 4200,
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
