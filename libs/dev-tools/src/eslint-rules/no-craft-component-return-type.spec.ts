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
        'ProductPage', {}, () => null,
      );
    `;
    const result = await lintText(source);
    const fixed = await lintText(source, true);

    expect(result.messages).toEqual([MESSAGE]);
    expect(fixed.messages).toEqual([]);
    expect(fixed.output).toContain('const ProductPage = craftComponent(');
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

  it('reports and fixes annotations on piped and sealed craftComponent results', async () => {
    const source = `
      import { craftComponent, sealComponent, withProviders } from '@craft-ts/component';

      const Piped: unknown = craftComponent('Piped', {}, () => null).pipe(withProviders([]));
      const Sealed: unknown = sealComponent(craftComponent('Sealed', {}, () => null));
    `;
    const result = await lintText(source);
    const fixed = await lintText(source, true);

    expect(result.messages).toEqual([MESSAGE, MESSAGE]);
    expect(fixed.messages).toEqual([]);
    expect(fixed.output).toContain('const Piped = craftComponent(');
    expect(fixed.output).toContain('const Sealed = sealComponent(');
    // A second pass has nothing left to fix.
    expect((await lintText(fixed.output ?? '', true)).output).toBeUndefined();
  });

  it('reports a component typed by hand with CraftComponent<…> (issue #40)', async () => {
    const result = await lintText(`
      import { type CraftComponent as Component, type PropsFromFactory } from '@craft-ts/component';
      import { PanelImpl } from './panel';

      export const Panel: Component<PropsFromFactory<() => never>> = PanelImpl;
    `);

    expect(result.messages).toEqual([ERASED_ANNOTATION]);
    // Removing the annotation can change what compiles: a suggestion, not a fix.
    expect(result.output).toBeUndefined();
    expect(result.suggestions).toEqual([
      'Remove the annotation and keep the inferred type.',
    ]);
  });

  it('reports an assertion to CraftComponent<…>', async () => {
    const result = await lintText(`
      import { craftComponent, type CraftComponent } from '@craft-ts/component';

      export const Menu = craftComponent('Menu', {}, () => null) as unknown as CraftComponent<{ x: number }, any>;
    `);

    expect(result.messages).toEqual([ERASED_ASSERTION]);
    expect(result.output).toBeUndefined();
  });

  it('leaves parameters, sealed annotations and unrelated types alone', async () => {
    const result = await lintText(`
      import { sealComponent, type CraftComponent, type SealedComponent } from '@craft-ts/component';
      import { PanelImpl } from './panel';
      import type { CraftComponent as Other } from './elsewhere';

      export function mount(component: CraftComponent<any>): void { void component; }
      export const Panel: SealedComponent<typeof PanelImpl> = sealComponent(PanelImpl);
      export const Unrelated: Other<string> = makeSomething();
    `);

    expect(result.messages).toEqual([]);
  });
});

const ERASED_ANNOTATION =
  'Do not type a component with CraftComponent<…>: the annotation drops its dependency contract, its exceptions and its heading need, and DI proofs then refuse it. Keep the inferred type, or seal it at the boundary with sealComponent(Component) to keep every contract without the template tree.';

const ERASED_ASSERTION =
  'Do not assert a component to CraftComponent<…>: the assertion drops its dependency contract, its exceptions and its heading need, and DI proofs then refuse it. Keep the inferred type, or seal it at the boundary with sealComponent(Component) to keep every contract without the template tree.';

async function lintText(
  source: string,
  fix = false,
): Promise<{ messages: string[]; output?: string; suggestions: string[] }> {
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
    suggestions: result.messages.flatMap((message) =>
      (message.suggestions ?? []).map((suggestion) => suggestion.desc),
    ),
  };
}
