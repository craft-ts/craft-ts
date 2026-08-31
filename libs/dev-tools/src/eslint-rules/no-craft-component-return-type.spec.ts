import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-craft-component-return-type.cjs');

const MESSAGE =
  'Do not annotate a craftComponent result. Keep the inferred type so its dependency and template contracts remain available.';

describe('no-craft-component-return-type', () => {
  it('reports and fixes ReturnType annotations on craftComponent results', async () => {
    const source = `
      import { craftComponent } from '@craft-ts/component';

      const ProductPage: ReturnType<typeof craftComponent> = craftComponent(
        'ProductPage', {}, function* () { return {}; }, () => null,
      );
    `;
    const result = await lintText(source);
    const fixed = await lintText(source, true);

    expect(result.messages).toEqual([MESSAGE]);
    expect(fixed.messages).toEqual([]);
    expect(fixed.output).toContain(
      'const ProductPage = craftComponent(',
    );
  });

  it('reports any explicit annotation while allowing inferred results', async () => {
    const result = await lintText(`
      import { craftComponent as component } from '@craft-ts/component';

      const Typed: unknown = component('Typed', {}, () => ({}), () => null);
      const Inferred = component('Inferred', {}, () => ({}), () => null);
      const unrelated: unknown = makeSomething();
    `);

    expect(result.messages).toEqual([MESSAGE]);
    expect(result.output).toBeUndefined();
  });
});

async function lintText(
  source: string,
  fix = false,
): Promise<{ messages: string[]; output?: string }> {
  const eslint = new ESLint({
    fix,
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
  return {
    messages: result.messages.map((message) => message.message),
    output: result.output,
  };
}
