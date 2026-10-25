import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { resolve } from 'node:path';

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  resolve: { alias: { '@craft-ts/component/session-trace': resolve(dirname(fileURLToPath(import.meta.url)), '../component/src/lib/ai/session-trace.ts') } },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
