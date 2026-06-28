import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('./require-lazy-load-with-retry.cjs');

describe('require-lazy-load-with-retry', () => {
  it('wraps component and children imports while preserving projections', async () => {
    const input = `
const routes = craftRoutes('test', [{
  loadComponent: () => import('./component'),
  loadChildren: () => import('./children').then((m) => m.routes),
}]);
`;

    const result = await lint(input, true);

    expect(result.messages).toEqual([]);
    expect(result.output).toContain(
      `loadComponent: ({ withRetry }) => withRetry(import('./component'))`,
    );
    expect(result.output).toContain(
      `loadChildren: ({ withRetry }) => withRetry(import('./children')).then((m) => m.routes)`,
    );
  });

  it('accepts imports already wrapped with withRetry', async () => {
    const result = await lint(`
const routes = craftRoutes('test', [{
  loadComponent: ({ withRetry }) => withRetry(import('./component')),
}]);
`);

    expect(result.messages).toEqual([]);
  });

  it('reports unsupported loader parameters without applying an unsafe fix', async () => {
    const result = await lint(`
const routes = craftRoutes('test', [{
  loadComponent: (context) => import('./component'),
}]);
`, true);

    expect(result.messages).toHaveLength(1);
    expect(result.output).toBeUndefined();
  });

  it('ignores native Angular routes where the helper is unavailable', async () => {
    const result = await lint(`
const routes = [{
  loadComponent: () => import('./component'),
}];
`);

    expect(result.messages).toEqual([]);
  });
});

async function lint(code: string, fix = false) {
  const root = await mkdtemp(join(tmpdir(), 'require-lazy-load-with-retry-'));
  await writeFile(join(root, 'input.ts'), code);

  const { ESLint } = await import('eslint');
  const eslint = new ESLint({
    cwd: root,
    fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { required: rule as never } } },
        rules: { 'local/required': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintFiles(['input.ts']);
  return result;
}
