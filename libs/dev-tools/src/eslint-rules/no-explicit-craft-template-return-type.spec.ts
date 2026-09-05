import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-explicit-craft-template-return-type.cjs');

const MESSAGE =
  'Do not annotate a Craft template callback return type explicitly. Let Craft infer the concrete node children so dependency and type-safe DI inference remain intact and runtime errors are avoided.';

describe('no-explicit-craft-template-return-type', () => {
  it('reports and fixes explicit return types on the component and render callbacks', async () => {
    const source = `
      import { craftComponent, div, p, pendingNode } from '@craft-ts/component';
      import type { CraftNodeChildren } from '@craft-ts/component';

      const Demo = craftComponent(
        'Demo', {}, () => ({}),
        (): CraftNodeChildren => div([
          p('content'),
        ]).pipe(pendingNode({
          fallback: (): CraftNodeChildren => p('waiting'),
          reloading: (): CraftNodeChildren => p('reloading'),
        })),
      );
    `;

    const result = await lint(source);
    expect(result.messages).toEqual([MESSAGE, MESSAGE, MESSAGE]);

    const fixed = await lint(source, true);
    expect(fixed.messages).toEqual([]);
    expect(fixed.output).not.toContain('(): CraftNodeChildren');
  });

  it('allows inferred render callbacks and explicitly typed action callbacks', async () => {
    const result = await lint(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function button(...args: unknown[]): unknown;

      craftComponent('Demo', {}, () => ({}), () => button({
        click: (event: MouseEvent): void => event.preventDefault(),
        onSubmit: (): void => undefined,
      }, 'Save'));
    `);

    expect(result.messages).toEqual([]);
  });

  it('checks nested render callbacks but not a nested component template twice', async () => {
    const result = await lint(`
      declare function craftComponent(...args: unknown[]): unknown;
      declare function p(...args: unknown[]): unknown;
      declare function pendingNode(...args: unknown[]): unknown;

      craftComponent('Outer', {}, () => ({}), () => p({
        fallback: (): string => 'wrong',
      }));

      craftComponent('Inner', {}, () => ({}), (): string => 'wrong');
    `);

    expect(result.messages).toEqual([MESSAGE, MESSAGE]);
  });
});

async function lint(
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
