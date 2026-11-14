import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-computed-in-component.cjs');
const plugin = require('./index.cjs');
const MESSAGE =
  'Do not declare craftComputed in a craftComponent factory. Move reactive derivations into a craftService and expose them to the component.';

describe('no-craft-computed-in-component', () => {
  it('reports reactive derivations owned by a component factory', async () => {
    const messages = await lintText(`
      import { craftComponent } from '@craft-ts/component';
      import { craftComputed as derive } from '@craft-ts/core';

      craftComponent('Demo', {}, function* () {
        const visibleItems = yield* derive('visibleItems', () => items());
        return div(visibleItems);
      });
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('ignores service derivations and checks a nested component on its own', async () => {
    const messages = await lintText(`
      import { craftComponent } from '@craft-ts/component';
      import { craftComputed, craftService } from '@craft-ts/core';

      craftService({ name: 'View', providedIn: 'global' }, function* () {
        yield* craftComputed('items', () => []);
      });
      craftComponent('Outer', {}, () =>
        craftComponent('Inner', {}, function* () {
          const items = yield* craftComputed('items', () => []);
          return div(items);
        }),
      );
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('recognizes namespace imports and is enabled in the presets', async () => {
    const messages = await lintText(`
      import * as component from '@craft-ts/component';
      import * as core from '@craft-ts/core';

      component.craftComponent('Demo', {}, () =>
        core.craftComputed('label', () => 'items'),
      );
    `);

    expect(messages).toEqual([MESSAGE]);
    expect(plugin.rules['no-craft-computed-in-component']).toBe(rule);
    expect(
      plugin.configs.recommended.rules[
        'craft-ts/no-craft-computed-in-component'
      ],
    ).toBe('error');
    expect(
      plugin.configs.effect.rules['craft-ts/no-craft-computed-in-component'],
    ).toBe('error');
  });
});

async function lintText(source: string): Promise<string[]> {
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
