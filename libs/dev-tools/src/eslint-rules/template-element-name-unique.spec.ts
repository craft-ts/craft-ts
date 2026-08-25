import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./template-element-name-unique.cjs');

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { local: { rules: { 'template-element-name-unique': rule } } },
        rules: { 'local/template-element-name-unique': 'error' },
      },
    ],
  });
  return eslint.lintText(code, { filePath: 'fixture.ts' });
}

describe('template-element-name-unique', () => {
  it('reports duplicate names across conditional branches', async () => {
    const [result] = await lint(`
      const component = craftComponent('Demo', {}, () => ({}), () =>
        ifNode(condition, () => button('save', {}, 'a'), () => button('save', {}, 'b'))
      );
    `);

    expect(result.messages.map((message) => message.message)).toEqual([
      'The template element name "button:save" is declared more than once in this component.',
    ]);
  });

  it('allows the same local name in separate component templates', async () => {
    const [result] = await lint(`
      const child = craftComponent('Child', {}, () => ({}), () => button('save', {}, 'child'));
      const parent = craftComponent('Parent', {}, () => ({}), () => button('save', {}, 'parent'));
    `);

    expect(result.messages).toEqual([]);
  });

  it('requires a statically resolvable name in the named form', async () => {
    const [result] = await lint(`
      const name = 'save';
      const component = craftComponent('Demo', {}, () => ({}), () => button(name, {}, 'save'));
    `);

    expect(result.messages.map((message) => message.message)).toEqual([
      'Craft template element names must be string literals that can be resolved statically.',
    ]);
  });
});
