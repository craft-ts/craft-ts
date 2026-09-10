import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./max-craft-component-lines.cjs');

describe('max-craft-component-lines', () => {
  it('allows a component under the default 700-line limit', async () => {
    const body = Array.from({ length: 50 }, (_, i) => `  // line ${i}`).join(
      '\n',
    );
    const result = await lint(`
      import { craftComponent } from '@craft-ts/component';

      export const Widget = craftComponent('Widget', {}, () => ({}), () => [
${body}
      ]);
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports a component over the configured line limit', async () => {
    const body = Array.from({ length: 20 }, (_, i) => `  // line ${i}`).join(
      '\n',
    );
    const result = await lint(
      `
      import { craftComponent } from '@craft-ts/component';

      export const Widget = craftComponent('Widget', {}, () => ({}), () => [
${body}
      ]);
    `,
      { max: 10 },
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('above the 10-line limit');
  });

  it('does not count import lines toward the limit', async () => {
    const imports = Array.from(
      { length: 30 },
      (_, i) => `import { fn${i} } from './fn${i}';`,
    ).join('\n');
    const result = await lint(
      `
${imports}
      import { craftComponent } from '@craft-ts/component';

      export const Widget = craftComponent('Widget', {}, () => ({}), () => []);
    `,
      { max: 10 },
    );

    expect(result.messages).toEqual([]);
  });

  it('supports namespace imports', async () => {
    const body = Array.from({ length: 20 }, (_, i) => `  // line ${i}`).join(
      '\n',
    );
    const result = await lint(
      `
      import * as component from '@craft-ts/component';

      export const Widget = component.craftComponent('Widget', {}, () => ({}), () => [
${body}
      ]);
    `,
      { max: 10 },
    );

    expect(result.messages).toHaveLength(1);
  });

  it('ignores local functions with the same name', async () => {
    const body = Array.from({ length: 20 }, (_, i) => `  // line ${i}`).join(
      '\n',
    );
    const result = await lint(
      `
      const craftComponent = () => {};

      craftComponent('Widget', {}, () => ({}), () => [
${body}
      ]);
    `,
      { max: 10 },
    );

    expect(result.messages).toEqual([]);
  });
});

async function lint(code: string, options?: { max?: number }) {
  const root = await mkdtemp(join(tmpdir(), 'max-craft-component-lines-'));
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
          rules: { 'local/localRule': ['error', options ?? {}] },
        },
      ],
    });
    const [result] = await eslint.lintFiles(['input.ts']);
    return result;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
