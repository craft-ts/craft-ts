/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import { resolve as resolvePath } from 'node:path';
import { craftStyle } from '@craft-ts/style/vite';
import { craftTextLoaderPlugin } from './vite-text-loader-plugin.mjs';

export default defineConfig({
  plugins: [
    craftTextLoaderPlugin(),
    craftStyle({
      alias: {
        '@craft-ts/style': resolvePath(
          import.meta.dirname,
          'node_modules/@craft-ts/style/src/index.js',
        ),
      },
    }),
  ],
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
