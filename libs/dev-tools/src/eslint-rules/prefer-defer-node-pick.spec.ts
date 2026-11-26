import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-defer-node-pick.cjs');
const recommended = require('./recommended-config.cjs');
const plugin = require('./index.cjs');

const message = (name: string) =>
  `Do not select the component inside the deferNode loader with \`.then(...)\`: in a template, the loaded component loses its type and its services vanish from the parent's DI proof. Return the module and name the export: \`deferNode(({ withRetry }) => withRetry(import('./module'))).pick('${name}', options)\`.`;

describe('prefer-defer-node-pick', () => {
  it('is exported and enabled by the recommended config at error severity', () => {
    expect(plugin.rules['prefer-defer-node-pick']).toBe(rule);
    expect(recommended['craft-ts/prefer-defer-node-pick']).toBe('error');
  });

  it('rewrites a .then selection into .pick, keeping the options', async () => {
    const source = `
      import { deferNode, p } from '@craft-ts/component';

      export const node = deferNode(
        ({ withRetry }) =>
          withRetry(import('./lazy-message')).then(
            (module) => module.lazyMessage,
          ),
        { trigger: 'interaction', placeholder: () => p('Load') },
      );
    `;
    const result = await lintText(source);
    const fixed = await lintText(source, true);

    expect(result.messages).toEqual([message('lazyMessage')]);
    expect(fixed.messages).toEqual([]);
    expect(fixed.output).toContain(
      "deferNode(({ withRetry }) =>\n          withRetry(import('./lazy-message'))).pick('lazyMessage', { trigger: 'interaction', placeholder: () => p('Load') });",
    );
    // A second pass has nothing left to fix.
    expect((await lintText(fixed.output ?? '', true)).output).toBeUndefined();
  });

  it('rewrites a bare import, a destructured selection and a missing options argument', async () => {
    const source = `
      import { deferNode as defer } from '@craft-ts/component';

      export const a = defer(() => import('./panel').then(({ Panel }) => Panel));
      export const b = defer(() => import('./panel').then((m) => m['Panel']));
    `;
    const result = await lintText(source);
    const fixed = await lintText(source, true);

    expect(result.messages).toEqual([message('Panel'), message('Panel')]);
    expect(fixed.output).toContain(
      "export const a = defer(() => import('./panel')).pick('Panel');",
    );
    expect(fixed.output).toContain(
      "export const b = defer(() => import('./panel')).pick('Panel');",
    );
  });

  it('reports without fixing when the replacement needs a human choice', async () => {
    const result = await lintText(`
      import { deferNode, p } from '@craft-ts/component';

      // \`resolve\` needs the loaded value itself: .pick does not accept it.
      export const a = deferNode(
        () => import('./panel').then((m) => m.Panel),
        { resolve: (Panel) => Panel() },
      );
      // Options passed by reference may hold \`resolve\`.
      export const b = deferNode(() => import('./panel').then((m) => m.Panel), options);
      // The selection cannot be read statically.
      export const c = deferNode(() => import('./panel').then((m) => m[key]));
    `);

    expect(result.messages).toHaveLength(3);
    expect(result.messages[2]).toContain(".pick('ExportName', options)");
    expect(result.output).toBeUndefined();
  });

  it('leaves loaders that do not select inside the loader alone', async () => {
    const result = await lintText(`
      import { deferNode, p } from '@craft-ts/component';
      import { deferNode as other } from './elsewhere';

      export const a = deferNode(({ withRetry }) => withRetry(import('./panel'))).pick('Panel');
      export const b = deferNode(() => Promise.resolve(Panel));
      export const c = deferNode(() => fetchValue().then((value) => value.label), {
        resolve: (label) => p(label),
      });
      export const d = other(() => import('./panel').then((m) => m.Panel));
    `);

    expect(result.messages).toEqual([]);
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
    messages: result.messages.map((entry) => entry.message),
    output: result.output,
  };
}
