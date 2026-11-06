import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { foldkit } from '@foldkit/vite-plugin';

const root = dirname(fileURLToPath(import.meta.url));

// Keep Foldkit's production view-identity transform out of the other fixtures.
export default defineConfig({
  root,
  plugins: [foldkit({ devToolsMcpPort: false })],
  build: {
    outDir: resolve(root, 'dist-foldkit'),
    emptyOutDir: true,
    minify: 'oxc',
    sourcemap: false,
    rolldownOptions: { input: resolve(root, 'foldkit/index.html') },
  },
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
