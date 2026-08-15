'use strict';

const { parseHyperscriptCall, property, stringLiteralValue } = require('./hyperscript-walk.cjs');

function tabIndexValue(props) {
  const entry = property(props, 'tabIndex') ?? property(props, 'tabindex');
  if (!entry) return undefined;
  if (entry.value.type === 'Literal' && typeof entry.value.value === 'number') {
    return entry.value.value;
  }
  if (entry.value.type === 'UnaryExpression' && entry.value.operator === '-' &&
      entry.value.argument.type === 'Literal' && typeof entry.value.argument.value === 'number') {
    return -entry.value.argument.value;
  }
  const asString = stringLiteralValue(entry.value);
  if (asString !== undefined && asString !== '') return Number(asString);
  return undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid positive tabIndex values that scramble focus order.',
    },
    schema: [],
    messages: {
      positive:
        'tabIndex must not be greater than 0. Use 0 (in order) or -1 (programmatic).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call) return;
        const value = tabIndexValue(call.props);
        if (typeof value === 'number' && value > 0) {
          context.report({ node, messageId: 'positive' });
        }
      },
    };
  },
};
