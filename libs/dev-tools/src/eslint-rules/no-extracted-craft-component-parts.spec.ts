import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-extracted-craft-component-parts.cjs');
const plugin = require('./index.cjs');

describe('no-extracted-craft-component-parts', () => {
  it('is enabled by the recommended preset', () => {
    expect(
      plugin.configs.recommended.rules[
        'craft-ts/no-extracted-craft-component-parts'
      ],
    ).toBe('error');
  });

  it('reports an extracted template identifier', async () => {
    const result = await lint(`
      import { craftComponent } from '@craft-ts/component';

      const ReviewTemplate = () => [];

      craftComponent('ReviewApp', {}, ReviewTemplate);
    `);

    expect(result.messages.map(({ message }) => message)).toEqual([
      'Keep the craftComponent template inline; do not extract it into "ReviewTemplate".',
    ]);
  });

  it('allows an inline template callback', async () => {
    const result = await lint(`
      import { craftComponent, craftTemplate } from '@craft-ts/component';

      craftComponent('ReviewApp', {}, craftTemplate(() => []));
    `);

    expect(result.messages).toEqual([]);
  });

  it('supports namespace imports', async () => {
    const result = await lint(`
      import * as component from '@craft-ts/component';
      const template = () => [];

      component.craftComponent('Demo', {}, template);
    `);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('template');
  });

  it('ignores local functions with the same name', async () => {
    const result = await lint(`
      const craftComponent = () => {};
      const template = () => [];

      craftComponent('Demo', {}, template);
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lint(source: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result;
}
