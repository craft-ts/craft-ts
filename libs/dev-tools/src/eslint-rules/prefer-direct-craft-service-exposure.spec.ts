import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./prefer-direct-craft-service-exposure.cjs');

describe('prefer-direct-craft-service-exposure', () => {
  it('reports same-name exposures from craftPrivate-wrapped services', async () => {
    const result = await lintFixture(`
      function* service() {
        const clientCurrency = yield* craftPrivate(ClientCurrency());
        yield* craftExpose('clientCurrency', clientCurrency);
      }
    `);

    expect(result.messages).toEqual([
      'This craftExpose only republishes the service under its own name. Yield the service directly instead.',
    ]);
  });

  it('reports exposed members destructured from a craftPrivate-wrapped service', async () => {
    const result = await lintFixture(`
      function* service() {
        const { language, translate } = yield* craftPrivate(I18n());
        yield* craftExpose('language', language);
        yield* craftExpose('translate', translate);
      }
    `);

    expect(result.messages).toEqual([
      'This craftExpose republishes a member from a yielded service. Yield the member directly with I18n.language().',
      'This craftExpose republishes a member from a yielded service. Yield the member directly with I18n.translate().',
    ]);
  });

  it('reports craftExpose repeating a named primitive result', async () => {
    const result = await lintFixture(`
      function* service() {
        const value = yield* state('value', 0);
        yield* craftExpose('value', value);
      }
    `);

    expect(result.messages).toEqual([
      'This craftExpose republishes a named state. The primitive is already exposed by its own name; remove craftExpose.',
    ]);
  });

  it('reports a member already returned by a public primitive', async () => {
    const result = await lintFixture(`
      function* service() {
        const searchInput = yield* state('searchInput', '', ({ set }) => ({
          setSearchInput: (value: string) => set(value),
        }));
        yield* craftExpose('setSearchInput', searchInput.setSearchInput);
      }
    `);

    expect(result.messages).toEqual([
      'This craftExpose republishes "searchInput.setSearchInput", which is already part of the service API. Remove craftExpose and use the nested path directly.',
    ]);
  });

  it('reports a primitive member re-exposed under a different name', async () => {
    const result = await lintFixture(`
      function* service() {
        const searchInput = yield* state('searchInput', '', ({ set }) => ({
          setSearchInput: (value: string) => set(value),
        }));
        yield* craftExpose('replaceSearchInput', searchInput.setSearchInput);
      }
    `);

    expect(result.messages).toEqual([
      'This craftExpose republishes "searchInput.setSearchInput", which is already part of the service API. Remove craftExpose and use the nested path directly.',
    ]);
  });

  it('allows private and undeclared primitive members', async () => {
    const result = await lintFixture(`
      function* service() {
        const searchInput = yield* state('searchInput', '', ({ set }) => ({
          setSearchInput: (value: string) => set(value),
        }));
        const privateInput = yield* craftPrivate(
          state('privateInput', '', ({ set }) => ({
            setPrivateInput: (value: string) => set(value),
          })),
        );
        yield* craftExpose('unknown', searchInput.unknown);
        yield* craftExpose('setPrivateInput', privateInput.setPrivateInput);
      }
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports craftExpose nested in a supported primitive callback', async () => {
    const result = await lintFixture(`
      function* service() {
        yield* asyncProcess('result', {
          loader: function* () {
            yield* craftExpose('value', 1);
          },
        });
      }
    `);

    expect(result.messages).toEqual([
      'Inside asyncProcess, do not use craftExpose. Yield the value from the craftService body and expose it there.',
    ]);
  });

  it('allows intentionally renamed primitive and standalone value exposures', async () => {
    const result = await lintFixture(`
      function* service() {
        const value = yield* state('value', 0);
        yield* craftExpose('renamedValue', value);
        yield* craftExpose('computed', value + 1);
      }
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
  return { messages: result.messages.map((message) => message.message) };
}
