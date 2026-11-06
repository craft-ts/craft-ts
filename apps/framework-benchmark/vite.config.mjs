import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import solid from 'vite-plugin-solid';
const root = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(root, '../..');
const frameworks = ['craft', 'react', 'vue', 'svelte', 'solid', 'vanilla'];
export default defineConfig({
  root,
  plugins: [vue(), svelte(), solid({ include: /solid\/.*\.tsx$/ })],
  resolve: {
    alias: {
      '@craft-ts/core': resolve(workspace, 'libs/core/src/index.ts'),
      '@craft-ts/component': resolve(workspace, 'libs/component/src/index.ts'),
      '@craft-ts/style': resolve(workspace, 'libs/style/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    minify: 'oxc',
    sourcemap: false,
    rolldownOptions: {
      input: Object.fromEntries(
        frameworks.map((name) => [name, resolve(root, `${name}/index.html`)]),
      ),
    },
  },
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
