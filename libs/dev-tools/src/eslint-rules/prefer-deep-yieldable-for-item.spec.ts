import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-deep-yieldable-for-item.cjs');

describe('prefer-deep-yieldable-for-item', () => {
  it('reports repeated property reads of a forNode item', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function forNode(...args: unknown[]): unknown;
      declare function div(...args: unknown[]): unknown;
      declare function span(...args: unknown[]): unknown;
      declare const catalog: { products: unknown };

      craftComponent('Catalog', {}, () => ({}), () =>
        div(forNode(catalog.products, { track: (product) => product }, (product) =>
          div([
            span(function* () { return (yield* product()).category; }),
            span(function* () { return (yield* product()).name; }),
          ]),
        )),
      );
    `);

    expect(result.messages.map((message) => message.message)).toEqual([
      "The `product` item is read repeatedly with `yield*` to access properties. Expose `catalog.products` as a named deep-yieldable collection (for example `insertDeepYieldable('products')` => `catalog.deepYieldableProducts`), or use `insertDeepYieldableValue()` for `query.value`, then bind properties directly as `product.property`.",
    ]);
  });

  it('does not report one read, non-item reads, or reads outside a component', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function forNode(...args: unknown[]): unknown;
      declare function div(...args: unknown[]): unknown;
      declare const catalog: { products: unknown };
      declare const other: () => Generator<unknown, { name: string }, unknown>;

      function render() {
        return forNode(catalog.products, { track: (product) => product }, (product) =>
          div(function* () { return (yield* product()).name; }),
        );
      }

      craftComponent('Catalog', {}, () => ({}), () =>
        div(forNode(catalog.products, { track: (product) => product }, (product) =>
          div(function* () {
            return (yield* other()).name + ':' + (yield* product()).name;
          }),
        )),
      );
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports nested list item templates independently', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function forNode(...args: unknown[]): unknown;
      declare function div(...args: unknown[]): unknown;
      declare const catalog: { categories: unknown };

      craftComponent('Catalog', {}, () => ({}), () =>
        div(forNode(catalog.categories, {}, (category) =>
          forNode(category.products, {}, (product) => div([
            div(function* () { return (yield* product()).name; }),
            div(function* () { return (yield* product()).sku; }),
          ])),
        )),
      );
    `);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('`product` item');
  });
});

async function lintFixture(source: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { deep: rule as never } } },
        rules: { 'local/deep': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result;
}
