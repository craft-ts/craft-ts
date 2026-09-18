import { ESLint, type Linter } from 'eslint';
import { createRequire } from 'node:module';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-form-for-input-action.cjs');

const MESSAGE =
  'This button action consumes the value of an input. Use a Craft form with state(..., insertForm(...)), connect mutations with insertFormSubmit(...), and submit through form(...); do not call mutate(...) or method(...) directly from the button.';

describe('require-form-for-input-action', () => {
  it('reports an action that consumes a value rendered in an input', async () => {
    const messages = await lint(`
      import { button, craftComponent, div, input } from '@craft-ts/component';
      import { mutation, state } from '@craft-ts/core';

      craftComponent('Demo', {}, function* () {
        const titleInput = yield* state('titleInput', '');
        const addTodo = yield* mutation('addTodo', { method: (title) => title, loader: () => undefined });
        return { titleInput, addTodo };
      }, ({ titleInput, addTodo }) => div([
        input({ value: titleInput }),
        button({ click: function* () { yield* addTodo.mutate((yield* titleInput()).trim()); } }),
      ]));
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('follows input dependencies through a local record and transformation', async () => {
    const messages = await lint(`
      import { button, craftComponent, div, input } from '@craft-ts/component';

      craftComponent('Demo', {}, ({ titleInput }) => div([
        input({ value: titleInput }),
        button({ click: function* () {
          const params = { payload: { title: (yield* titleInput()).trim() } };
          yield* addTodo.mutate(params);
        } }),
      ]));
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('detects an async process method with an input-dependent record', async () => {
    const messages = await lint(`
      import { button, craftComponent, div, input } from '@craft-ts/component';

      craftComponent('Demo', {}, ({ query }) => div([
        input({ value: query }),
        button({ click: () => searchProcess.method({ query: query() }) }),
      ]));
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('accepts the Craft form composition', async () => {
    const messages = await lint(`
      import { button, craftComponent, form, input } from '@craft-ts/component';
      import { insertForm, insertFormSubmit, state } from '@craft-ts/core';

      craftComponent('Demo', {}, function* () {
        const titleForm = yield* state('titleForm', { title: '' }, insertForm(
          insertFormSubmit(saveTitle),
        ));
        return { titleForm };
      }, ({ titleForm }) => form({
        submit: function* () { yield* titleForm.form.submit(); },
      }, [
        input({ value: titleForm.form.title }),
        button({ type: 'submit' }),
      ]));
    `);

    expect(messages).toEqual([]);
  });

  it('rejects a direct mutation click even when a form is also present', async () => {
    const messages = await lint(`
      import { button, craftComponent, form, input } from '@craft-ts/component';
      import { insertForm, insertFormSubmit, state } from '@craft-ts/core';

      craftComponent('Demo', {}, function* () {
        const titleForm = yield* state('titleForm', '', insertForm(
          insertFormSubmit(saveTitle),
        ));
        return { titleForm };
      }, ({ titleForm }) => form('DemoForm', {
        *submit(event) { event.preventDefault(); yield* titleForm.form.submit(); },
      }, [
        input('TitleInput', { value: titleForm.form }),
        button({ click: function* () { yield* saveTitle.mutate(titleForm.form); } }),
      ]));
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('ignores an input when the button action does not consume it', async () => {
    const messages = await lint(`
      import { button, craftComponent, div, input } from '@craft-ts/component';

      craftComponent('Demo', {}, () => div([
        input({ value: 'search' }),
        button({ click: () => navigate('/next') }),
      ]));
    `);

    expect(messages).toEqual([]);
  });

  it('only treats a button click as a submit-like action', async () => {
    const messages = await lint(`
      import { craftComponent, div, input } from '@craft-ts/component';

      craftComponent('Demo', {}, ({ value }) => div([
        input({ value, input: () => save(value()) }),
      ]));
    `);

    expect(messages).toEqual([]);
  });

  it('recognises an extracted template and an aliased craftComponent', async () => {
    const messages = await lint(`
      import { button, craftComponent as component, div, input } from '@craft-ts/component';
      import { state } from '@craft-ts/core';

      const render = ({ value }) => div([
        input({ value }),
        button({ click: () => save.mutate(value()) }),
      ]);

      component('Demo', {}, function* () {
        const value = yield* state('value', '');
        return { value };
      }, render);
    `);

    expect(messages).toEqual([MESSAGE]);
  });
});

async function lint(source: string): Promise<string[]> {
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
