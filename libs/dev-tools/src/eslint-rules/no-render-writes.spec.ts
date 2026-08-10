import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-render-writes.cjs');

describe('no-render-writes', () => {
  it('reports writes in a component template and a render binding', async () => {
    const result = await lintFixture(`
      craftComponent('Counter', {}, () => ({ count }), ({ count }) => {
        count.set(1);
        return p(() => {
          count.update(value => value + 1);
          return count();
        });
      });
    `);

    expect(result).toEqual([
      'Do not call set() while rendering a Craft template. Move the write to a DOM event, output, mutation, or explicit business effect.',
      'Do not call update() while rendering a Craft template. Move the write to a DOM event, output, mutation, or explicit business effect.',
    ]);
  });

  it('allows writes from DOM events and output callbacks', async () => {
    const result = await lintFixture(`
      craftComponent('Counter', {}, () => ({ count }), ({ count }) =>
        div([
          button({ click: () => count.update(value => value + 1) }, '+'),
          Child({ onReset: () => count.set(0) }),
        ]),
      );
    `);

    expect(result).toEqual([]);
  });

  it('reports a nested component template only once', async () => {
    const result = await lintFixture(`
      craftComponent('Parent', {}, () => ({}), () => {
        const Child = craftComponent('Child', {}, () => ({ count }), ({ count }) => {
          count.set(1);
          return p('child');
        });
        return Child();
      });
    `);

    expect(result).toEqual([
      'Do not call set() while rendering a Craft template. Move the write to a DOM event, output, mutation, or explicit business effect.',
    ]);
  });
});

async function lintFixture(source: string): Promise<string[]> {
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
  return result.messages.map((message) => message.message);
}
