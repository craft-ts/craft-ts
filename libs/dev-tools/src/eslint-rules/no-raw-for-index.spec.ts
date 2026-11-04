import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-raw-for-index.cjs');
const plugin = require('./index.cjs');
const imported = "import { forNode } from '@craft-ts/component';";
async function lint(source: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser as unknown as Linter.Parser },
        plugins: { local: { rules: { index: rule } } },
        rules: { 'local/index': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages;
}

describe('no-raw-for-index', () => {
  it.each([
    '`${index}`',
    'String(index)',
    'Boolean(index)',
    'Number(index)',
    '!!index',
    'index + 1',
    'index < 1',
    'index ? a : b',
    'index && a',
    'index.toString()',
    'new String(index)',
    '`${index()}`',
    'String(index())',
    'Boolean(index())',
    'index() ? a : b',
    'index().toString()',
  ])('rejects scalar coercion: %s', async (expression) => {
    const messages = await lint(
      `${imported} forNode(items, { track: x => x.id }, (item, index) => p(${expression}));`,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('yield* index()');
    expect(messages[0].fix).toBeUndefined();
  });

  it('rejects boolean statement tests and immutable reader/generator aliases', async () => {
    expect(
      await lint(`${imported}
      forNode(items, {}, (item, position) => {
        const alias = position;
        const iterator = alias();
        const stringify = String;
        if (alias) p('bad');
        while (iterator) break;
        return p(stringify(iterator));
      });
    `),
    ).toHaveLength(3);
  });

  it('follows import aliases, namespace imports, local aliases and named callbacks', async () => {
    expect(
      await lint(`
      import { forNode as each } from '@craft-ts/component';
      import * as craft from '@craft-ts/component';
      const renderAlias = render;
      const list = each;
      function render(item, position) { return p(String(position)); }
      list(items, {}, renderAlias);
      craft.forNode(items, {}, (item, number) => p(\`\${number}\`));
    `),
    ).toHaveLength(2);
  });

  it('distinguishes nested readers and shadowed variables by scope', async () => {
    expect(
      await lint(`${imported}
      forNode(items, {}, (item, index) => {
        const valid = (index: number) => String(index);
        return forNode(items, {}, (item, inner) => p(String(index), String(inner)));
      });
    `),
    ).toHaveLength(2);
    expect(
      await lint(`${imported}
      function render(forNode) { return forNode(items, {}, (item, index) => String(index)); }
      forNode(items, {}, (item, index) => {
        const String = value => value;
        return p(String(index));
      });
    `),
    ).toHaveLength(0);
  });

  it('accepts delegated reads, direct bindings, reactive inputs and stored readers', async () => {
    expect(
      await lint(`${imported}
      forNode(items, { track: (item, index) => index + 1 }, (item, index) => {
        const position = index;
        save(position);
        save(position === index);
        save(index instanceof Function);
        const context = { position };
        return [p(index), Row({ position }), p(function* () {
          return \`\${(yield* position()) + 1}\`;
        })];
      });
    `),
    ).toHaveLength(0);
  });

  it('leaves unrelated imports and unresolved or mutable callbacks alone', async () => {
    expect(
      await lint(`
      import { forNode } from './for-node';
      forNode(items, {}, (item, index) => String(index));
    `),
    ).toHaveLength(0);
    expect(
      await lint(`${imported}
      import render from './render';
      let mutable = forNode;
      mutable = other;
      mutable(items, {}, (item, index) => String(index));
      forNode(items, {}, render);
    `),
    ).toHaveLength(0);
  });

  it('is exported and enabled as an error in recommended and Effect presets', () => {
    expect(plugin.rules['no-raw-for-index']).toBe(rule);
    expect(plugin.configs.recommended.rules['craft-ts/no-raw-for-index']).toBe(
      'error',
    );
    expect(plugin.configs.effect.rules['craft-ts/no-raw-for-index']).toBe(
      'error',
    );
  });
});
