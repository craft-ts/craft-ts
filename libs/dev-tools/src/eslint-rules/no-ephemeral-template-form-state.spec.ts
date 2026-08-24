import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-ephemeral-template-form-state.cjs');

const DECLARE_HOSTS = `
  declare function craftComponent(...args: unknown[]): unknown;
  declare function craftDirective(...args: unknown[]): unknown;
  declare function div(children?: unknown): unknown;
  declare function input(options?: object): unknown;
  declare function button(options?: object): unknown;
  declare function forNode(...args: unknown[]): unknown;
`;

describe('no-ephemeral-template-form-state', () => {
  it('reports a const declared inside a click handler', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}
      declare const nameInput: () => string;
      declare function update(value: string): unknown;

      craftComponent('Demo', {}, function* () { return {}; }, () =>
        button({
          *click() {
            const currentName = yield* nameInput();
            yield* update(currentName);
          },
        }),
      );
    `);

    expect(result.messages).toEqual([
      declareMessage('currentName', 'const'),
    ]);
  });

  it('reports a let at the template root', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      craftComponent('Demo', {}, function* () { return {}; }, () => {
        let field;
        return div([
          input({ input: (event) => { field = event.target; } }),
          button({ click: () => field?.focus() }),
        ]);
      });
    `);

    expect(result.messages).toEqual([declareMessage('field', 'let')]);
  });

  it('reports var and const at the template root', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      craftComponent('Demo', {}, function* () { return {}; }, () => {
        var count = 0;
        const label = 'todos';
        return div([label, count]);
      });
    `);

    expect(result.messages).toEqual([
      declareMessage('count', 'var'),
      declareMessage('label', 'const'),
    ]);
  });

  it('reports a const inside each and binding generators', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}
      declare const todos: unknown[];

      craftComponent('Demo', {}, function* () { return {}; }, () =>
        div(
          forNode(todos, { track: (todo) => todo.id }, (todo) => {
            const title = todo.title;
            return div(function* () {
              const completed = yield* todo();
              return completed;
            });
          }),
        ),
      );
    `);

    expect(result.messages).toEqual([
      declareMessage('title', 'const'),
      declareMessage('completed', 'const'),
    ]);
  });

  it('reports a destructuring declaration', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      craftComponent('Demo', {}, function* () { return {}; }, () => {
        const { title } = { title: 'x' };
        return div(title);
      });
    `);

    expect(result.messages).toEqual([
      'Do not declare const bindings in a Craft template. Move them to the logic factory as state() or craftComputed().',
    ]);
  });

  it('does not report declarations in the logic factory', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}
      declare function state(...args: unknown[]): unknown;

      craftComponent('Demo', {}, function* () {
        const nameInput = state('nameInput');
        let scratch = 0;
        return { nameInput, scratch };
      }, ({ nameInput, setName }) => div([
        input({ input: (event) => setName(event.target.value) }),
        button({ click: () => nameInput() }),
      ]));
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports declarations in a craftDirective template transformer', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      craftDirective(
        'Highlight',
        {},
        (baseLogic) => () => {
          const extra = 1;
          return { ...baseLogic(), extra };
        },
        (baseTemplate) => (context) => {
          const node = baseTemplate(context);
          return node;
        },
      );
    `);

    expect(result.messages).toEqual([declareMessage('node', 'const')]);
  });

  it('reports an extracted same-file template identifier', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      const render = () => {
        let field;
        return div(field);
      };

      craftComponent('Demo', {}, function* () { return {}; }, render);
    `);

    expect(result.messages).toEqual([declareMessage('field', 'let')]);
  });

  it('reports a same-file function declaration used as template', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      function render() {
        const title = 'todos';
        return div(title);
      }

      craftComponent('Demo', {}, function* () { return {}; }, render);
    `);

    expect(result.messages).toEqual([declareMessage('title', 'const')]);
  });

  it('does not follow imported template identifiers', async () => {
    const result = await lintFixture(`
      import { render } from './render';
      ${DECLARE_HOSTS}

      craftComponent('Demo', {}, function* () { return {}; }, render);
    `);

    expect(result.messages).toEqual([]);
  });

  it('reports nested craftComponent templates via their own call', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      craftComponent('Parent', {}, function* () { return {}; }, () =>
        craftComponent('Child', {}, function* () { return {}; }, () => {
          const title = 'child';
          return div(title);
        }),
      );
    `);

    expect(result.messages).toEqual([declareMessage('title', 'const')]);
  });

  it('does not report templates without local declarations', async () => {
    const result = await lintFixture(`
      ${DECLARE_HOSTS}

      craftComponent('Demo', {}, function* () { return {}; }, ({ todos }) =>
        div(forNode(todos, { track: (todo) => todo.id }, (todo) => div(todo.title))),
      );
    `);

    expect(result.messages).toEqual([]);
  });
});

function declareMessage(name: string, kind: string) {
  return `Do not declare '${name}' with ${kind} in a Craft template. Move it to the logic factory as state() or craftComputed().`;
}

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
