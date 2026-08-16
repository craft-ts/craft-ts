import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./no-craft-service-component-same-file.cjs');

describe('no-craft-service-component-same-file', () => {
  it('reports craftService and craftComponent declarations in the same file', async () => {
    const result = await lint(`
      import { craftComponent } from '@craft-ng/component';
      import { craftService } from '@craft-ng/core';

      const { DemoService } = craftService({ name: 'DemoService', scope: 'route' }, function* () {
        return {};
      });
      const DemoComponent = craftComponent('DemoComponent', {}, () => ({}), () => []);
    `);

    expect(result.messages).toHaveLength(2);
    expect(result.messages.map(({ message }) => message)).toEqual([
      'Do not declare craftService and craftComponent in the same file. If the service is provided at route level while the component is lazy-loaded, co-location breaks lazy loading; keep them in separate files.',
      'Do not declare craftService and craftComponent in the same file. If the service is provided at route level while the component is lazy-loaded, co-location breaks lazy loading; keep them in separate files.',
    ]);
  });

  it('supports aliased and namespace imports', async () => {
    const result = await lint(`
      import { craftComponent as createComponent } from '@craft-ng/component';
      import * as core from '@craft-ng/core';

      const service = core.craftService({ name: 'Service', scope: 'global' }, () => ({}));
      const component = createComponent('Component', {}, () => ({}), () => []);
    `);

    expect(result.messages).toHaveLength(2);
  });

  it('allows files that declare only one kind of Craft host', async () => {
    const serviceResult = await lint(`
      import { craftService } from '@craft-ng/core';

      const service = craftService({ name: 'Service', scope: 'global' }, () => ({}));
    `);
    const componentResult = await lint(`
      import { craftComponent } from '@craft-ng/component';

      const component = craftComponent('Component', {}, () => ({}), () => []);
    `);

    expect(serviceResult.messages).toEqual([]);
    expect(componentResult.messages).toEqual([]);
  });

  it('ignores local functions with the same names', async () => {
    const result = await lint(`
      const craftService = () => ({});
      const craftComponent = () => ({});

      craftService();
      craftComponent();
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lint(code: string) {
  const root = await mkdtemp(
    join(tmpdir(), 'no-craft-service-component-same-file-'),
  );
  try {
    await writeFile(join(root, 'input.ts'), code);
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tsParser as unknown as Linter.Parser,
            parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module',
            },
          },
          plugins: { local: { rules: { localRule: rule as never } } },
          rules: { 'local/localRule': 'error' },
        },
      ],
    });
    const [result] = await eslint.lintFiles(['input.ts']);
    return result;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
