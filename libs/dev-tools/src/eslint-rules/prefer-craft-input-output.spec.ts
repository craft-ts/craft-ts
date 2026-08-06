import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-input-output.cjs');

const INPUT_MESSAGE =
  'Angular input()/@Input is forbidden in authored Craft code. Declare the dependency with Input from @craft-ng/component in craftComponent(...).';
const OUTPUT_MESSAGE =
  'Angular output()/@Output is forbidden in authored Craft code. Declare the dependency with Output from @craft-ng/component in craftComponent(...).';

describe('prefer-craft-input-output', () => {
  it('reports Angular input/output functions and decorators', async () => {
    const messages = await lintText(`
      import { Input, Output, input, output } from '@angular/core';

      class LegacyComponent {
        @Input() title!: string;
        @Output() selected = output<string>();
        readonly name = input<string>();
      }
    `);

    expect(messages).toEqual([
      INPUT_MESSAGE,
      OUTPUT_MESSAGE,
      INPUT_MESSAGE,
      OUTPUT_MESSAGE,
      INPUT_MESSAGE,
      OUTPUT_MESSAGE,
      OUTPUT_MESSAGE,
      INPUT_MESSAGE,
    ]);
  });

  it('reports namespace APIs and output helper functions', async () => {
    const messages = await lintText(`
      import * as ng from '@angular/core';
      import { outputFromObservable } from '@angular/core';

      const value = ng.input.required<string>();
      const changed = ng.output<number>();
      const streamed = outputFromObservable(source$);
      void [value, changed, streamed];
    `);

    expect(messages).toEqual([
      OUTPUT_MESSAGE,
      INPUT_MESSAGE,
      OUTPUT_MESSAGE,
      OUTPUT_MESSAGE,
    ]);
  });

  it('allows Craft Input and Output types', async () => {
    const messages = await lintText(`
      import { craftComponent, type Input, type Output } from '@craft-ng/component';

      const Card = craftComponent(
        'card',
        {},
        (title: Input<string>, onSelect: Output<(id: string) => void>) => ({
          title,
          onSelect,
        }),
        ({ title }) => title(),
      );
      void Card;
    `);

    expect(messages).toEqual([]);
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
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            ecmaFeatures: { legacyDecorators: true },
          },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}
