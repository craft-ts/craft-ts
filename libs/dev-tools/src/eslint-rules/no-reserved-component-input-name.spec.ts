import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');
const hostProperties = require('./component-host-properties.cjs');
const name = 'no-reserved-component-input-name';

// The `@craft-ts/component` runtime's own classification, which the rule must
// mirror exactly. Loaded by path: dev-tools must not depend on the component
// package (component already depends on dev-tools through core).
const runtimeHostProperties = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../component/src/lib/render/host-properties.ts',
);

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe(name, () => {
  it('is enabled at error severity in the recommended and effect presets', () => {
    expect(plugin.rules[name]).toBeDefined();
    expect(plugin.configs.recommended.rules[`craft-ts/${name}`]).toBe('error');
    expect(plugin.configs.effect.rules[`craft-ts/${name}`]).toBe('error');
  });

  it('accepts component-specific input names', async () => {
    const result = await lint(`
      import { craftComponent, span, type Input } from '@craft-ts/component';

      export const Field = craftComponent(
        'Field',
        {},
        (inputs: { label: Input<string>; titleText: Input<string>; errorMessage: Input<string>; onSave: () => void; dataset: Input<string> }) =>
          span(inputs.label),
      );
    `);

    expect(result.messages).toEqual([]);
  });

  it('accepts reserved names passed at a call site, which target the root element', async () => {
    const result = await lint(`
      import { craftComponent, div, span, type Input } from '@craft-ts/component';

      const Field = craftComponent('Field', {}, (inputs: { label: Input<string> }) => span(inputs.label));
      export const View = craftComponent('View', {}, () =>
        div([Field({ label: 'Name', title: 'Tooltip', id: 'name', 'data-testid': 'field' })]),
      );
    `);

    expect(result.messages).toEqual([]);
  });

  it('ignores factories that are not craftComponent from @craft-ts/component', async () => {
    const result = await lint(`
      import { craftComponent } from 'some-other-library';
      const craftLocal = (name: string, meta: object, factory: (inputs: { title: string }) => unknown) => factory;

      craftComponent('Other', {}, (inputs: { title: string }) => inputs.title);
      craftLocal('Local', {}, (inputs: { title: string }) => inputs.title);
    `);

    expect(result.messages).toEqual([]);
  });

  it('rejects inputs named like a host property, a data-/aria- attribute or a DOM event', async () => {
    const result = await lint(`
      import { craftComponent, span, type Input } from '@craft-ts/component';

      export const Field = craftComponent(
        'Field',
        {},
        (inputs: {
          title: Input<string>;
          id: Input<string>;
          slot: Input<string>;
          'data-state': Input<string>;
          'aria-label': Input<string>;
          error: Input<string>;
          input: Input<string>;
          onClick: () => void;
          label: Input<string>;
        }) => span(inputs.label),
      );
    `);

    expect(
      result.messages.map(({ messageId, line }) => ({ messageId, line })),
    ).toEqual(
      [8, 9, 10, 11, 12, 13, 14, 15].map((line) => ({
        messageId: 'reserved',
        line,
      })),
    );
    expect(result.messages[0].message).toBe(
      'The input `title` of component "Field" never reaches the component: at a component call, `title` is reserved for a DOM property of the root element. Rename the input to a component-specific name, for example `fieldTitle`; callers can still pass `title` to set it on the root element.',
    );
    expect(result.messages[3].message).toContain(
      'reserved for a DOM attribute of the root element',
    );
    expect(result.messages[3].message).toContain('`fieldDataState`');
    expect(result.messages[5].message).toContain(
      'reserved for a DOM event listener of the root element',
    );
  });

  it('reads destructured inputs, local type aliases, interfaces and namespace imports', async () => {
    const result = await lint(`
      import * as component from '@craft-ts/component';
      import { craftComponent as defineComponent } from '@craft-ts/component';

      type CardInputs = { readonly heading: string } & { readonly lang: string };
      interface BaseInputs { readonly hidden: boolean }
      export interface PanelInputs extends BaseInputs { readonly slot: string }

      export const Card = defineComponent('Card', {}, (inputs: CardInputs) => inputs.heading);
      export const Panel = component.craftComponent('Panel', {}, function* (inputs: PanelInputs) {
        return inputs.slot;
      });
      export const Badge = defineComponent('Badge', {}, ({ dir }) => dir);
      // A shared declaration is reported once, where it is declared.
      export const OtherCard = defineComponent('OtherCard', {}, (inputs: CardInputs) => inputs.heading);
    `);

    expect(
      result.messages.map(({ message }) => /`(\w+)`/.exec(message)?.[1]),
    ).toEqual(['lang', 'hidden', 'slot', 'dir']);
    expect(result.messages[0].message).toContain('`cardLang`');
  });

  it('resolves imported input types with typed linting', async () => {
    const messages = await lintTyped({
      'inputs.ts': `
        export interface ProductInputs {
          readonly name: string;
          readonly title: string;
          readonly onError: () => void;
        }
      `,
      'fixture.ts': `
        import { craftComponent } from '@craft-ts/component';
        import type { ProductInputs } from './inputs';

        export const Product = craftComponent('Product', {}, (inputs: ProductInputs) => inputs.name);
      `,
    });

    expect(messages).toEqual([
      expect.stringContaining('The input `title` of component "Product"'),
      expect.stringContaining('The input `onError` of component "Product"'),
    ]);
  });
});

describe('component host property vocabulary', () => {
  it('mirrors the classification of the @craft-ts/component runtime', async () => {
    const runtime = (await import(
      /* @vite-ignore */ runtimeHostProperties
    )) as {
      HOST_EVENT_NAMES: ReadonlySet<string>;
      HOST_PROPERTY_NAMES: ReadonlySet<string>;
      HOST_ATTRIBUTE_PREFIXES: readonly string[];
      isComponentHostPropertyName(key: string): boolean;
    };
    expect([...hostProperties.HOST_EVENT_NAMES].sort()).toEqual(
      [...runtime.HOST_EVENT_NAMES].sort(),
    );
    expect([...hostProperties.HOST_PROPERTY_NAMES].sort()).toEqual(
      [...runtime.HOST_PROPERTY_NAMES].sort(),
    );
    expect(hostProperties.HOST_ATTRIBUTE_PREFIXES).toEqual(
      runtime.HOST_ATTRIBUTE_PREFIXES,
    );

    const samples = [
      ...runtime.HOST_PROPERTY_NAMES,
      ...runtime.HOST_EVENT_NAMES,
      ...[...runtime.HOST_EVENT_NAMES].map(
        (event) => `on${event[0].toUpperCase()}${event.slice(1)}`,
      ),
      'data-state',
      'aria-label',
      'data',
      'aria',
      'label',
      'titleText',
      'onSave',
      'onclick',
      'on',
      'classList',
      'value',
      'checked',
      'children',
      '$provided',
    ];
    for (const key of samples) {
      expect(hostProperties.isComponentHostPropertyName(key), key).toBe(
        runtime.isComponentHostPropertyName(key),
      );
    }
  });
});

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { 'craft-ts': plugin },
        rules: { [`craft-ts/${name}`]: 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'fixture.ts' });
  return result;
}

async function lintTyped(files: Record<string, string>): Promise<string[]> {
  const directory = await mkdtemp(join(tmpdir(), 'craft-reserved-input-'));
  temporaryDirectories.push(directory);
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'preserve',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        noResolve: false,
        types: [],
      },
      include: Object.keys(files),
    }),
  );
  for (const [file, source] of Object.entries(files)) {
    await writeFile(join(directory, file), source);
  }

  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            project: './tsconfig.json',
            tsconfigRootDir: directory,
          },
        },
        plugins: { 'craft-ts': plugin },
        rules: { [`craft-ts/${name}`]: 'error' },
      },
    ],
  });

  const [result] = await eslint.lintFiles(['fixture.ts']);
  return result.messages.map((message) => message.message);
}
