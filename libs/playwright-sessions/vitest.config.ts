import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { resolve } from 'node:path';

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  resolve: { alias: { '@craft-ts/session-trace': resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/session-trace/src/index.ts') } },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
