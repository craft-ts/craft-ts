import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./prefer-craft-template-blocks.cjs');

describe('prefer-craft-template-blocks', () => {
  it('accepts typed Craft blocks and ordinary template reads', async () => {
    const messages = await lintText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({ ready: state, kind: query }),
        ({ ready, kind }) => div([
          ifBlock(ready, () => p('ready'), () => p('not ready')),
          matchBlock.exhaustive(kind, 'code', {
            OK: () => p('ok'),
            ERROR: () => p('error'),
          }),
          each(items, { track: (item) => item.id }, (item) => p(item.name)),
        ]),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('allows imperative control flow inside DOM event handlers', async () => {
    const messages = await lintText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({ store }),
        ({ store }) => button(
          {
            disabled: store.add.isLoading(),
            click: () => {
              if (title.trim()) {
                store.add.mutate(title.trim());
              }
            },
          },
          'Add',
        ),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('allows logic inside template pipes', async () => {
    const messages = await lintText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({ canReadRestrictedData, noAccess, lastHandledException }),
        ({ restrictedContent }) => restrictedContent.pipe(
          withProviders([
            provideRestrictedData(() =>
              canReadRestrictedData() ? 'accessible' : noAccess,
            ),
          ]),
          catchTag.exhaustive({
            NO_ACCESS: function* () {
              lastHandledException.set('NO_ACCESS');
            },
          }),
        ),
      );
    `);

    expect(messages).toEqual([]);
  });

  it('reports ternaries, logical expressions, and imperative control flow', async () => {
    const messages = await lintText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({}),
        ({ ready, label }) => {
          if (ready()) {
            return p(label);
          }
          return div({ class: ready() ? 'yes' : 'no' }, ready() && label);
        },
      );
    `);

    expect(messages).toEqual([
      'Do not use imperative control flow in a Craft template. Use ifBlock(...), matchBlock.exhaustive(...), each(...), or defer(...) so the render contract stays type-checkable.',
      'Do not use a ternary in a Craft template. Use ifBlock(...) for boolean visibility or matchBlock.exhaustive(...) for a discriminated union.',
      'Do not use a logical expression in a Craft template. Move the derivation to state, query, or craftComputed, then render it with a Craft block.',
    ]);
  });

  it('does not inspect a nested component twice', async () => {
    const messages = await lintText(`
      const Child = craftComponent(
        'Child',
        {},
        () => ({}),
        () => p(ready ? 'yes' : 'no'),
      );
      const Parent = craftComponent(
        'Parent',
        {},
        () => ({}),
        () => Child(),
      );
    `);

    expect(messages).toHaveLength(1);
  });

  it('offers a quick fix for renderable ternaries', async () => {
    const fixed = await fixText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({}),
        ({ ready }) => div([
          button({}, () => ready() ? 'Ready' : 'Waiting'),
          ready() ? p('Ready') : p('Waiting'),
        ]),
      );
    `);

    expect(fixed).toContain("import { ifBlock } from '@craft-ts/component';");
    expect(fixed).toContain(
      "button({}, ifBlock(ready, () => 'Ready', () => 'Waiting'))",
    );
    expect(fixed).toContain(
      "ifBlock(ready, () => p('Ready'), () => p('Waiting'))",
    );
  });

  it('offers a quick fix for exhaustive switch returns', async () => {
    const fixed = await fixText(`
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({}),
        ({ result }) => {
          switch (result().code) {
            case 'OK': return p('ok');
            case 'ERROR': return p('error');
          }
        },
      );
    `);

    expect(fixed).toContain(
      "import { matchBlock } from '@craft-ts/component';",
    );
    expect(fixed).toContain(
      "return matchBlock.exhaustive(() => result(), \"code\", { OK: () => p('ok'), ERROR: () => p('error') });",
    );
  });

  it('does not rewrite ordinary values as Craft reactive conditions', async () => {
    const source = `
      const Demo = craftComponent(
        'Demo',
        {},
        () => ({}),
        ({ value }) => div([value ? p('yes') : p('no')]),
      );
    `;

    const fixed = await fixText(source);
    expect(fixed).toBe(source);
  });
});

async function lintText(source: string): Promise<string[]> {
  const result = await lint(source);
  return result.messages.map((message) => message.message);
}

async function fixText(source: string): Promise<string> {
  const result = await lint(source, true);
  return result.output ?? source;
}

async function lint(source: string, fix = false) {
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
  return result;
}
