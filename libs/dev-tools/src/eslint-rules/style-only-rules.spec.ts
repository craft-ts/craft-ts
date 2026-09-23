/**
 * The rules that make the design system the only way to style a component:
 * `no-raw-class` (now unconditional), `no-inline-style`, `no-component-css`,
 * and the mandatory reason on disabling one of them.
 */
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rawClassRule = require('./no-raw-class.cjs');
const inlineStyleRule = require('./no-inline-style.cjs');
const componentCssRule = require('./no-component-css.cjs');
const disableRule = require('./no-forbidden-eslint-disable.cjs');
const plugin = require('./index.cjs');

async function lint(rule: unknown, code: string, options?: unknown) {
  const { Linter } = await import('eslint');
  const linter = new Linter({ configType: 'flat' });
  // Only this rule's reports: the directives name rules this linter does not
  // load, and ESLint reports those on its own.
  const messages = linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        linterOptions: { reportUnusedDisableDirectives: 0 },
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: {
          'local/rule': options === undefined ? 'error' : ['error', options],
        },
      },
    ],
    'component.ts',
  );
  return messages.filter((message) => message.ruleId === 'local/rule');
}

const ids = (messages: readonly Linter.LintMessage[]) =>
  messages.map((message) => message.messageId);

describe('no-raw-class', () => {
  it('fires without any @craft-ts/style import', async () => {
    expect(
      ids(await lint(rawClassRule, `div({ class: 'card' }, []);`)),
    ).toEqual(['rawClass']);
  });

  it('accepts a sheet class imported from a *.style module, directly or through a const', async () => {
    const messages = await lint(
      rawClassRule,
      `
      import { card } from './card.style';
      import { badgeRoot } from '../ui/badge.style.ts';
      const root = card.root;
      div({ class: card.body }, []);
      div({ class: badgeRoot }, []);
      div({ class: root }, []);
      div({ class: [card.body, card.title] }, []);
      div({ class: () => card.body }, []);
      div({ class: function* () { return card.body; } }, []);
      div({ class: null }, []);
    `,
    );
    expect(messages).toEqual([]);
  });

  it('accepts a typed input', async () => {
    const messages = await lint(
      rawClassRule,
      `export const Chip = (inputs) => div({ class: inputs.tone }, []);
       export const Tag = (cls) => span({ class: cls }, []);`,
    );
    expect(messages).toEqual([]);
  });

  it('reports host classes, attrs classes, arrays and objects', async () => {
    const messages = await lint(
      rawClassRule,
      `
      import { card } from './card.style';
      craftComponent('x', { host: { class: 'x-host' } }, () => null);
      div({ attrs: { class: 'legacy' } }, []);
      div({ class: [card.body, 'extra'] }, []);
      div({ class: { active: isActive() } }, []);
      div({ class: isActive() ? card.body : card.title }, []);
      div({ class: \`tone-\${tone()}\` }, []);
    `,
    );
    expect(ids(messages)).toEqual([
      'rawClass',
      'rawClass',
      'rawClass',
      'computedClass',
      'computedClass',
      'computedClass',
    ]);
  });

  it('refuses a class that does not trace back to a *.style module', async () => {
    const messages = await lint(
      rawClassRule,
      `
      import { craftStyles } from '@craft-ts/style';
      import { theme } from './theme';
      const local = craftStyles('local', { root: [] });
      div({ class: local.root }, []);
      div({ class: theme.root }, []);
    `,
    );
    expect(ids(messages)).toEqual(['untracedClass', 'untracedClass']);
  });

  it('leaves destructuring and non-class keys alone', async () => {
    const messages = await lint(
      rawClassRule,
      `const { class: cls } = props; const x = { className: 'a', klass: 'b' };`,
    );
    expect(messages).toEqual([]);
  });
});

describe('no-inline-style', () => {
  it('accepts assign() and what only produces it', async () => {
    const messages = await lint(
      inlineStyleRule,
      `
      import { assign } from '@craft-ts/style';
      import { v } from './bar.style';
      const vars = assign(v.width, width);
      div({ style: assign(v.width, width) }, []);
      div({ style: [assign(v.width, width), assign(v.color, color)] }, []);
      div({ style: { ...assign(v.width, width) } }, []);
      div({ style: () => (ready() ? assign(v.width, width()) : null) }, []);
      div({ style: vars }, []);
      div({ style: function* () { return assign(v.width, width); } }, []);
    `,
    );
    expect(messages).toEqual([]);
  });

  it('reports raw CSS, a look-alike assign, and attrs.style', async () => {
    const messages = await lint(
      inlineStyleRule,
      `
      import { assign } from './my-helpers';
      div({ style: 'color: red' }, []);
      div({ style: () => (copied() ? null : { display: 'none' }) }, []);
      div({ style: assign(x, y) }, []);
      div({ attrs: { style: 'margin: 0' } }, []);
      craftComponent('x', { host: { style: { color: 'red' } } }, () => null);
    `,
    );
    expect(ids(messages)).toEqual([
      'rawStyle',
      'rawStyle',
      'rawStyle',
      'attrsStyle',
      'rawStyle',
    ]);
  });

  it('only reads hyperscript props, not any object with a style key', async () => {
    const messages = await lint(
      inlineStyleRule,
      `new Intl.NumberFormat('fr', { style: 'currency', currency: 'EUR' });`,
    );
    expect(messages).toEqual([]);
  });
});

describe('no-component-css', () => {
  it('reports meta CSS and .css imports, and lets the emitted sheet through', async () => {
    const messages = await lint(
      componentCssRule,
      `
      import 'virtual:craft-style.css';
      import './styles.css';
      import sheet from './widget.css?inline';
      craftComponent('x', { styles: '.x{}', stylesUrl: sheet, contentStyles: {} }, () => null);
      craftDirective('y', { styles: ['.y{}'] });
      const later = () => import('./late.css');
    `,
    );
    expect(ids(messages)).toEqual([
      'cssImport',
      'cssImport',
      'metaCss',
      'metaCss',
      'metaCss',
      'metaCss',
      'cssImport',
    ]);
  });
});

describe('disabling a style rule needs a reason', () => {
  it('reports a directive without "-- reason", and accepts one with it', async () => {
    const messages = await lint(
      disableRule,
      [
        '// eslint-disable-next-line craft-ts/no-raw-class',
        'const a = 1;',
        '// eslint-disable-next-line craft-ts/no-raw-class -- markdown output carries its own classes',
        'const b = 2;',
        '/* eslint-disable-next-line craft-ts/no-inline-style, no-console */',
        'const c = 3;',
        '// eslint-disable-next-line no-console',
        'const d = 4;',
      ].join('\n'),
    );
    expect(ids(messages)).toEqual(['missingReason', 'missingReason']);
    expect(messages.map((message) => message.line)).toEqual([1, 5]);
  });

  it('cannot see a blanket directive, which silences it too', async () => {
    // Documented limit: Review Attest lists blanket directives instead.
    const messages = await lint(
      disableRule,
      '/* eslint-disable */\nconst a = 1;',
    );
    expect(messages).toEqual([]);
  });

  it('takes the rule list from its options', async () => {
    const messages = await lint(
      disableRule,
      '// eslint-disable-next-line craft-ts/no-raw-class\nconst a = 1;',
      { reasonRequiredRules: [] },
    );
    expect(messages).toEqual([]);
  });
});

describe('the recommended preset', () => {
  it('makes the design-system rules errors and moves meta-CSS rules to legacyComponentCss', () => {
    const recommended = plugin.configs.recommended.rules;
    for (const rule of [
      'no-raw-class',
      'no-inline-style',
      'no-component-css',
      'no-forbidden-eslint-disable',
    ]) {
      expect(recommended[`craft-ts/${rule}`]).toBe('error');
      expect(plugin.rules[rule]).toBeDefined();
    }
    const legacy = Object.keys(plugin.configs.legacyComponentCss.rules);
    expect(legacy).toContain('craft-ts/require-focus-visible');
    for (const rule of legacy) expect(recommended[rule]).toBeUndefined();
  });
});
