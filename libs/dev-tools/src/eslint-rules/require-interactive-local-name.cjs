'use strict';

const { NAMED_HTML_HELPER_SET } = require('./html-helpers.cjs');
const {
  parseHyperscriptCall,
  staticPropString,
  hasProp,
} = require('./hyperscript-walk.cjs');

const ALWAYS_INTERACTIVE = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
]);

const INTERACTIVE_HANDLERS = [
  'click',
  'onClick',
  'input',
  'onInput',
  'change',
  'onChange',
  'submit',
  'onSubmit',
];

const EXEMPT_HELPERS = new Set([
  'option',
  'iframe',
  'img',
  'heading',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

const NAMED_FORM_EXAMPLES = {
  a: "a('docs', { href: '/guide' }, 'Docs')",
  button: "button('save', { type: 'button' }, 'Save')",
  input: "input('email', { type: 'email' })",
  select: "select('country', {}, [])",
  textarea: "textarea('bio', {}, [])",
  div: "div('panel', {}, 'x')",
};

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a string literal local name on interactive Craft hyperscript helpers.',
    },
    schema: [],
    messages: {
      missingLocalName:
        '{{tag}}() must take a string literal local name as its first argument: {{example}}.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || call.via !== 'helper' || !call.tag) return;
        if (
          !NAMED_HTML_HELPER_SET.has(call.tag) ||
          EXEMPT_HELPERS.has(call.tag)
        ) {
          return;
        }
        const second = node.arguments[1];
        const props =
          call.props ??
          (second?.type === 'ObjectExpression' ? second : undefined);
        if (!isInteractiveCall(call.tag, props)) return;
        if (typeof call.name === 'string') return;

        context.report({
          node,
          messageId: 'missingLocalName',
          data: {
            tag: call.tag,
            example: namedFormExample(call.tag),
          },
        });
      },
    };
  },
};

function isInteractiveCall(tag, props) {
  if (tag === 'input' && staticPropString(props, 'type') === 'hidden') {
    return false;
  }
  if (ALWAYS_INTERACTIVE.has(tag)) return true;
  return INTERACTIVE_HANDLERS.some((name) => hasProp(props, name));
}

function namedFormExample(tag) {
  return NAMED_FORM_EXAMPLES[tag] ?? `${tag}('name', {}, [])`;
}
