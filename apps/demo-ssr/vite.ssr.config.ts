import { defineConfig } from 'vite';
import * as path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-ssr-server',
  publicDir: false,
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    outDir: path.resolve(root, '../../dist/apps/demo-ssr/server'),
    emptyOutDir: true,
    ssr: path.resolve(root, 'src/production-server.ts'),
    minify: 'oxc',
    sourcemap: false,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        entryFileNames: 'server.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        format: 'es',
      },
    },
  },
});
