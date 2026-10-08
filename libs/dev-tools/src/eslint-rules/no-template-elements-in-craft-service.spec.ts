import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-template-elements-in-craft-service.cjs');

const MESSAGE =
  'Do not build template nodes or blocks inside `craftService`. Build the template in `craftComponent` and keep the service focused on state and domain actions.';
const TEMPLATE_FACTORIES = [
  'a',
  'article',
  'aside',
  'area',
  'button',
  'caption',
  'catchNode',
  'content',
  'craftTemplate',
  'customElement',
  'deferNode',
  'details',
  'dialog',
  'div',
  'fieldset',
  'fieldErrorNode',
  'figcaption',
  'figure',
  'footer',
  'forNode',
  'form',
  'h',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'heading',
  'headingRoot',
  'headingSection',
  'iframe',
  'ifNode',
  'img',
  'input',
  'label',
  'legend',
  'li',
  'liveRegion',
  'main',
  'matchNode',
  'nav',
  'ol',
  'option',
  'p',
  'pendingNode',
  'pre',
  'renderTemplate',
  'renderContent',
  'section',
  'select',
  'scheduleFor',
  'skipLink',
  'small',
  'span',
  'strong',
  'summary',
  'svg',
  'table',
  'tbody',
  'td',
  'textarea',
  'th',
  'thead',
  'tr',
  'ul',
];

describe('no-template-elements-in-craft-service', () => {
  it('reports every declared template node and block factory', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { ${TEMPLATE_FACTORIES.join(', ')} } from '@craft-ts/component';

      craftService({ name: 'view', providedIn: 'global' }, function* () {
        ${TEMPLATE_FACTORIES.map((factory) => `${factory}();`).join('\n        ')}
      });
    `);

    expect(result.messages).toHaveLength(TEMPLATE_FACTORIES.length);
    expect(result.messages.every((message) => message === MESSAGE)).toBe(true);
  });

  it.each([
    [
      'HTML helpers',
      'button(); div(); h("span"); customElement("my-card");',
      'button, div, h, customElement',
    ],
    [
      'template blocks',
      'forNode(items, {}, () => button()); ifNode(flag, button()); scheduleFor();',
      'forNode, button, ifNode, button, scheduleFor',
    ],
    [
      'semantic and special nodes',
      'heading("Title"); liveRegion("status"); pendingNode(); matchNode(value); catchNode(value); deferNode(value);',
      'heading, liveRegion, pendingNode, matchNode, catchNode, deferNode',
    ],
  ])(
    'reports %s constructed in a service factory',
    async (_name, body, names) => {
      const helpers = names.split(', ').filter((name) => name !== 'h');
      const extraImport = names.includes('h') ? ', h' : '';
      const imports = [...new Set(helpers)].join(', ');
      const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { ${imports}${extraImport} } from '@craft-ts/component';

      craftService({ name: 'view', providedIn: 'global' }, function* () {
        ${body}
      });
    `);

      expect(result.messages).toHaveLength(names.split(', ').length);
      expect(result.messages.every((message) => message === MESSAGE)).toBe(
        true,
      );
    },
  );

  it('recognizes aliased named imports and namespace imports', async () => {
    const result = await lint(`
      import { craftService as service } from '@craft-ts/core';
      import { button as makeButton, forNode as each } from '@craft-ts/component';
      import * as component from '@craft-ts/component';

      service({ name: 'view', providedIn: 'global' }, function* () {
        makeButton();
        component.div();
        each([], {}, () => component.span());
      });
    `);

    expect(result.messages).toHaveLength(4);
    expect(result.messages.every((message) => message === MESSAGE)).toBe(true);
  });

  it('recognizes template factories destructured from a namespace import', async () => {
    const result = await lint(`
      import * as core from '@craft-ts/core';
      import * as component from '@craft-ts/component';

      core.craftService({ name: 'view', providedIn: 'global' }, function* () {
        const { button: makeButton, forNode } = component;
        makeButton();
        forNode([], {}, () => null);
      });
    `);

    expect(result.messages).toHaveLength(2);
    expect(result.messages.every((message) => message === MESSAGE)).toBe(true);
  });

  it('inspects a service factory passed by identifier', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { button } from '@craft-ts/component';

      function* createView() {
        button();
      }
      craftService({ name: 'view', providedIn: 'global' }, createView);
    `);

    expect(result.messages).toEqual([MESSAGE]);
  });

  it('ignores template factories in components and outside service factories', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { craftComponent } from '@craft-ts/component';
      import { button } from '@craft-ts/component';

      function outside() { button(); }
      craftService({ name: 'view', providedIn: 'global' }, function* () {
        function domainAction() { return 'saved'; }
        domainAction();
      });
      craftComponent('Demo', {}, () => button());
      outside();
    `);

    expect(result.messages).toEqual([]);
  });

  it('ignores local functions and similarly named helpers from another module', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { button } from './domain-actions';
      const forNode = () => 'domain value';

      craftService({ name: 'view', providedIn: 'global' }, function* () {
        button();
        forNode();
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('ignores a shadowed imported factory name', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { button } from '@craft-ts/component';

      craftService({ name: 'view', providedIn: 'global' }, function* () {
        function action(button: () => void) { button(); }
        action(() => undefined);
      });
    `);

    expect(result.messages).toEqual([]);
  });

  it('ignores a service property that shares a template factory name', async () => {
    const result = await lint(`
      import { craftService } from '@craft-ts/core';
      import { select } from '@craft-ts/component';

      craftService({ name: 'view', providedIn: 'global' }, function* () {
        const filter = { select: () => 'status' };
        filter.select();
      });
    `);

    expect(result.messages).toEqual([]);
  });
});

async function lint(source: string) {
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
  return { messages: result.messages.map(({ message }) => message) };
}
