import * as path from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const workspace = path.resolve(root, '../..');

/**
 * The prerender script, bundled for Node. The pages need the browser bundle's file
 * names, so this runs after it; `nx build docs-herbier` runs the two in order and
 * then the script.
 */
export default defineConfig({
  root,
  cacheDir: path.resolve(workspace, 'node_modules/.vite/apps/docs-herbier-server'),
  publicDir: false,
  resolve: { tsconfigPaths: true },
  build: {
    outDir: path.resolve(workspace, 'dist/apps/docs-herbier-server'),
    emptyOutDir: true,
    ssr: path.resolve(root, 'src/server/prerender.ts'),
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: { entryFileNames: 'prerender.mjs', chunkFileNames: 'chunks/[name]-[hash].mjs', format: 'es' },
    },
  },
});
