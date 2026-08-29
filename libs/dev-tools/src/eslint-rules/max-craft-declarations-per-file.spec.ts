import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./max-craft-declarations-per-file.cjs');

describe('max-craft-declarations-per-file', () => {
  it('allows up to two declarations of every Craft kind', async () => {
    const result = await lint(`
      import { craftComponent, craftDirective } from '@craft-ts/component';
      import { craftService } from '@craft-ts/core';

      craftComponent('ComponentOne', {}, () => ({}), () => []);
      craftComponent('ComponentTwo', {}, () => ({}), () => []);
      craftDirective('DirectiveOne', {}, () => ({}), () => []);
      craftDirective('DirectiveTwo', {}, () => ({}), () => []);
      craftService({ name: 'ServiceOne', scope: 'global' }, () => ({}));
      craftService({ name: 'ServiceTwo', scope: 'global' }, () => ({}));
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports declarations after the second one for each Craft kind', async () => {
    const result = await lint(`
      import { craftComponent, craftDirective } from '@craft-ts/component';
      import { craftService } from '@craft-ts/core';

      craftComponent('ComponentOne', {}, () => ({}), () => []);
      craftComponent('ComponentTwo', {}, () => ({}), () => []);
      craftComponent('ComponentThree', {}, () => ({}), () => []);
      craftDirective('DirectiveOne', {}, () => ({}), () => []);
      craftDirective('DirectiveTwo', {}, () => ({}), () => []);
      craftDirective('DirectiveThree', {}, () => ({}), () => []);
      craftService({ name: 'ServiceOne', scope: 'global' }, () => ({}));
      craftService({ name: 'ServiceTwo', scope: 'global' }, () => ({}));
      craftService({ name: 'ServiceThree', scope: 'global' }, () => ({}));
    `);

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map(({ message }) => message)).toEqual([
      'Do not declare more than two craft components in the same file. Move the additional Craft entity to its own file.',
      'Do not declare more than two craft directives in the same file. Move the additional Craft entity to its own file.',
      'Do not declare more than two craft services in the same file. Move the additional Craft entity to its own file.',
    ]);
  });

  it('supports aliases and namespace imports', async () => {
    const result = await lint(`
      import { craftComponent as createComponent, craftDirective as createDirective } from '@craft-ts/component';
      import * as core from '@craft-ts/core';
      import * as component from '@craft-ts/component';

      createComponent('ComponentOne', {}, () => ({}), () => []);
      createComponent('ComponentTwo', {}, () => ({}), () => []);
      component.craftComponent('ComponentThree', {}, () => ({}), () => []);
      createDirective('DirectiveOne', {}, () => ({}), () => []);
      createDirective('DirectiveTwo', {}, () => ({}), () => []);
      component.craftDirective('DirectiveThree', {}, () => ({}), () => []);
      core.craftService({ name: 'ServiceOne', scope: 'global' }, () => ({}));
      core.craftService({ name: 'ServiceTwo', scope: 'global' }, () => ({}));
      core.craftService({ name: 'ServiceThree', scope: 'global' }, () => ({}));
    `);

    expect(result.messages).toHaveLength(3);
  });

  it('ignores local functions with the same names', async () => {
    const result = await lint(`
      const craftComponent = () => {};
      const craftDirective = () => {};
      const craftService = () => {};

      craftComponent();
      craftComponent();
      craftComponent();
      craftDirective();
      craftDirective();
      craftDirective();
      craftService();
      craftService();
      craftService();
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lint(code: string) {
  const root = await mkdtemp(
    join(tmpdir(), 'max-craft-declarations-per-file-'),
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
