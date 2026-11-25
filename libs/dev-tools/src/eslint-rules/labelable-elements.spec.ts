import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const labelHasAssociatedControl = require('./label-has-associated-control.cjs');
const controlHasAccessibleName = require('./control-has-accessible-name.cjs');
const { isLabelableCall } = require('./labelable-elements.cjs');
const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser },
});

/** Issue #52: the switch from the bug report, wrapped by its label. */
const wrappedSwitch = `label([span('Dark mode'), button({ type: 'button', role: 'switch', 'aria-checked': 'false' })]);`;

describe('labelable elements (HTML Standard)', () => {
  function callOf(source: string) {
    // Parse a single expression statement and return the hyperscript call.
    const { parse } = require('@typescript-eslint/parser');
    const program = parse(source, { range: true });
    return parseHyperscriptCall(program.body[0].expression);
  }

  it.each([
    "button({ type: 'button' })",
    "input({ type: 'checkbox' })",
    'input({})',
    "h('meter', { value: 1 })",
    "h('output', {})",
    "h('progress', { value: 1 })",
    'select({})',
    'textarea({})',
  ])('treats %s as labelable', (source) => {
    if (!isLabelableCall(callOf(source))) {
      throw new Error(`${source} should be labelable`);
    }
  });

  it.each([
    "input({ type: 'hidden' })",
    "input({ type: 'HIDDEN' })",
    "div({ role: 'switch' })",
    "a({ href: '/x' }, 'x')",
    "span('x')",
    "customElement('x-switch', {})",
  ])('does not treat %s as labelable', (source) => {
    if (isLabelableCall(callOf(source))) {
      throw new Error(`${source} should not be labelable`);
    }
  });
});

ruleTester.run('label-has-associated-control', labelHasAssociatedControl, {
  valid: [
    {
      name: 'issue #52: label wrapping a button role=switch',
      code: wrappedSwitch,
    },
    {
      name: 'label wrapping a button',
      code: `label([span('Notify me'), button({ type: 'button' })]);`,
    },
    {
      name: 'label htmlFor pointing at a button id',
      code: `label({ htmlFor: 'dark-mode' }, 'Dark mode'); button({ id: 'dark-mode', type: 'button', role: 'switch', 'aria-checked': 'false' });`,
    },
    {
      name: 'label for pointing at a meter id via h()',
      code: `label({ for: 'disk' }, 'Disk usage'); h('meter', { id: 'disk', value: 0.6 });`,
    },
    {
      name: 'label wrapping progress, output, meter',
      code: `label(['Upload', h('progress', { value: 1 })]); label(['Total', h('output', {})]); label(['Disk', h('meter', { value: 1 })]);`,
    },
    {
      name: 'label wrapping a hidden input and a visible one',
      code: `label([input({ type: 'hidden', name: 'csrf' }), 'Email', input({ type: 'email' })]);`,
    },
    {
      name: 'label htmlFor an id declared elsewhere (spread props, other file)',
      code: `label({ htmlFor: 'email' }, 'Email'); input('email', { ...email.input, type: 'email' });`,
    },
    {
      name: 'label wrapping input, select and textarea',
      code: `label([input({ id: 'email' })]); label(['Size', select({})]); label(['Bio', textarea({})]);`,
    },
  ],
  invalid: [
    {
      name: 'label with neither htmlFor nor a nested control',
      code: `label('Email');`,
      errors: [{ messageId: 'unassociated' }],
    },
    {
      name: 'label wrapping only a hidden input',
      code: `label(['Token', input({ type: 'hidden', name: 'token' })]);`,
      errors: [{ messageId: 'unassociated' }],
    },
    {
      name: 'label wrapping a div role=switch',
      code: `label([span('Dark mode'), div({ role: 'switch', 'aria-checked': 'false', tabIndex: 0 })]);`,
      errors: [{ messageId: 'unassociated' }],
    },
    {
      name: 'label htmlFor pointing at a hidden input id',
      code: `label({ htmlFor: 'token' }, 'Token'); input({ id: 'token', type: 'hidden' });`,
      errors: [{ messageId: 'unassociated' }],
    },
    {
      name: 'label htmlFor pointing at a div id',
      code: `label({ htmlFor: 'dark-mode' }, 'Dark mode'); div({ id: 'dark-mode', role: 'switch', 'aria-checked': 'false' });`,
      errors: [{ messageId: 'unassociated' }],
    },
  ],
});

ruleTester.run('control-has-accessible-name', controlHasAccessibleName, {
  valid: [
    {
      name: 'issue #52: label wrapping a button role=switch',
      code: wrappedSwitch,
    },
    {
      name: 'wrapping label with plain text',
      code: `label(['Dark mode', button({ type: 'button', role: 'switch', 'aria-checked': 'false' })]);`,
    },
    {
      name: 'wrapping label with an i18n t() call',
      code: `label([span(i18n.t('settings.darkMode')), button({ type: 'button', role: 'switch', 'aria-checked': 'false' })]);`,
    },
    {
      name: 'wrapping label with props and text after the control',
      code: `label({ class: 'row' }, [button({ type: 'button', role: 'switch', 'aria-checked': 'true' }), span('Dark mode')]);`,
    },
    {
      name: 'label htmlFor pointing at a button id (label first)',
      code: `label({ htmlFor: 'dark-mode' }, 'Dark mode'); button({ id: 'dark-mode', type: 'button', role: 'switch', 'aria-checked': 'false' });`,
    },
    {
      name: 'label htmlFor pointing at a button id (label after)',
      code: `button({ id: 'dark-mode', type: 'button', role: 'switch', 'aria-checked': 'false' }); label({ for: 'dark-mode' }, i18n.t('settings.darkMode'));`,
    },
    {
      name: 'textarea and select named by their label',
      code: `label(['Bio', textarea({})]); label({ htmlFor: 'size' }, 'Size'); select({ id: 'size' });`,
    },
    {
      name: 'input[type=submit] wrapped by a label with text',
      code: `label(['Send the form', input({ type: 'submit' })]);`,
    },
  ],
  invalid: [
    {
      name: 'switch button with no label and no text',
      code: `button({ type: 'button', role: 'switch', 'aria-checked': 'false' });`,
      errors: [{ messageId: 'missingName', data: { tag: 'button' } }],
    },
    {
      name: 'switch button wrapped by a label with no text',
      code: `label([button({ type: 'button', role: 'switch', 'aria-checked': 'false' })]);`,
      errors: [{ messageId: 'missingName', data: { tag: 'button' } }],
    },
    {
      name: 'label htmlFor pointing at another id',
      code: `label({ htmlFor: 'other' }, 'Dark mode'); button({ id: 'dark-mode', type: 'button', role: 'switch', 'aria-checked': 'false' });`,
      errors: [{ messageId: 'missingName', data: { tag: 'button' } }],
    },
    {
      name: 'wrapping label whose static for points elsewhere',
      code: `label({ htmlFor: 'other' }, ['Dark mode', button({ id: 'dark-mode', type: 'button', role: 'switch', 'aria-checked': 'false' })]);`,
      errors: [{ messageId: 'missingName', data: { tag: 'button' } }],
    },
    {
      name: 'only the first labelable descendant is labelled',
      code: `label(['Accept', input({ type: 'checkbox' }), button({ type: 'button' })]);`,
      errors: [{ messageId: 'missingName', data: { tag: 'button' } }],
    },
    {
      name: 'a link is not labelable: a wrapping label does not name it',
      code: `label(['Profile', a({ href: '/profile' })]);`,
      errors: [{ messageId: 'missingName', data: { tag: 'a' } }],
    },
  ],
});
