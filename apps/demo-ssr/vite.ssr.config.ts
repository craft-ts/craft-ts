import { defineConfig } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';

const root = import.meta.dirname;
const outputDirectory = path.resolve(root, '../../dist/apps/demo-ssr/server');

function copyServerFunctionData() {
  return {
    name: 'copy-server-function-data',
    async writeBundle() {
      const dataDirectory = path.resolve(outputDirectory, '../../data');
      await mkdir(dataDirectory, { recursive: true });
      await copyFile(
        path.resolve(root, '../demo-with-server-function/data/users.json'),
        path.resolve(dataDirectory, 'users.json'),
      );
    },
  };
}

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-ssr-server',
  publicDir: false,
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [copyServerFunctionData()],
  build: {
    outDir: outputDirectory,
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
