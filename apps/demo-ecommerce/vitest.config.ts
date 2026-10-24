/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');
export default defineConfig({ root, resolve: { tsconfigPaths: true, alias: { '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'), '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts') } }, test: { name: 'demo-ecommerce', environment: 'node', include: ['src/**/*.spec.ts'] } });
