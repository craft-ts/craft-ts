import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const rule = require('./require-craft-component-for-exported-node-factory.cjs');

const MESSAGE = (name: string) =>
  `Exported function "${name}" returns a Craft node directly. Wrap it in craftComponent(...) so Craft directives and composition can be applied.`;

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: {
          local: { rules: { 'exported-node-factory': rule } },
        },
        rules: { 'local/exported-node-factory': 'error' },
      },
    ],
  });
  return eslint.lintText(code, { filePath: 'fixture.ts' });
}

describe('require-craft-component-for-exported-node-factory', () => {
  it('allows a local function returning a Craft node', async () => {
    const [result] = await lint(
      `function filterButton() { return button('filter'); }`,
    );
    expect(result.messages).toEqual([]);
  });

  it('rejects a directly exported function returning a Craft node', async () => {
    const [result] = await lint(
      `export function filterButton() { return button('filter'); }`,
    );
    expect(result.messages.map((message) => message.message)).toEqual([
      MESSAGE('filterButton'),
    ]);
  });

  it('rejects a function exported through an export list', async () => {
    const [result] = await lint(`
      function filterButton() { return button('filter'); }
      export { filterButton };
    `);
    expect(result.messages.map((message) => message.message)).toEqual([
      MESSAGE('filterButton'),
    ]);
  });

  it('rejects an exported arrow function returning a Craft node', async () => {
    const [result] = await lint(
      `export const filterButton = () => button('filter');`,
    );
    expect(result.messages.map((message) => message.message)).toEqual([
      MESSAGE('filterButton'),
    ]);
  });

  it('rejects a default-exported function', async () => {
    const [result] = await lint(
      `export default function filterButton() { return button('filter'); }`,
    );
    expect(result.messages.map((message) => message.message)).toEqual([
      MESSAGE('filterButton'),
    ]);
  });

  it('allows exported functions that do not return a Craft node directly', async () => {
    const [result] = await lint(`
      export function makeFilter() { return { name: 'all' }; }
      export function getButton() { return createButton(); }
    `);
    expect(result.messages).toEqual([]);
  });

  it('allows an exported craftComponent result', async () => {
    const [result] = await lint(`
      import { craftComponent } from '@craft-ts/component';
      export const FilterButton = craftComponent('FilterButton', {}, () => ({}), () => button('filter'));
    `);
    expect(result.messages).toEqual([]);
  });

  it('is enabled as an error in the recommended preset', () => {
    expect(
      plugin.configs.recommended.rules[
        'craft-ts/require-craft-component-for-exported-node-factory'
      ],
    ).toBe('error');
  });
});
