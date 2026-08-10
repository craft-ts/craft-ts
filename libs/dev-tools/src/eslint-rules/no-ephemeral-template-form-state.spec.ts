import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-ephemeral-template-form-state.cjs');

describe('no-ephemeral-template-form-state', () => {
  it('reports a value written by input and read by click', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function div(children: unknown[]): unknown;
      declare function input(options: object): unknown;
      declare function button(options: object): unknown;

      craftComponent('Demo', {}, function* () { return {}; }, ({ update }) => {
        let name = '';
        return div([
          input({
            input: (event) => {
              name = (event.target as HTMLInputElement).value;
            },
          }),
          button({ click: () => update(name) }),
        ]);
      });
    `);

    expect(result.messages).toEqual([
      "Template form value 'name' is written by an input handler and read by another event handler. Store it with state() so it survives template re-evaluation.",
    ]);
  });

  it('does not report values already delegated to state', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function div(children: unknown[]): unknown;
      declare function input(options: object): unknown;
      declare function button(options: object): unknown;
      declare function state(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        const nameInput = state('nameInput');
        return { nameInput };
      }, ({ nameInput, setName, update }) => div([
        input({ input: (event) => setName(event.target.value) }),
        button({ click: () => update(nameInput()) }),
      ]));
    `);

    expect(result.messages).toEqual([]);
  });

  it('does not report a value used only by its input handler', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function input(options: object): unknown;

      craftComponent('Demo', {}, function* () { return {}; }, () => {
        let name = '';
        return input({
          input: (event) => {
            name = event.target.value;
            console.log(name);
          },
        });
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('does not report a DOM element captured from input', async () => {
    const result = await lintFixture(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function div(children: unknown[]): unknown;
      declare function input(options: object): unknown;
      declare function button(options: object): unknown;

      craftComponent('Demo', {}, function* () { return {}; }, () => {
        let field;
        return div([
          input({ input: (event) => { field = event.target; } }),
          button({ click: () => field?.focus() }),
        ]);
      });
    `);

    expect(result.messages).toEqual([]);
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
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return {
    messages: result.messages.map((message) => message.message),
  };
}
