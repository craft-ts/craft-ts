'use strict';

const ariaQuery = require('aria-query');
const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Reject unknown aria-* attributes on Craft hyperscript nodes.',
    },
    schema: [],
    messages: {
      unknown: '"{{name}}" is not a valid ARIA attribute.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call?.props || call.props.type !== 'ObjectExpression') return;
        for (const entry of call.props.properties) {
          if (entry.type !== 'Property' || entry.computed) continue;
          const name =
            entry.key.type === 'Identifier'
              ? entry.key.name
              : entry.key.type === 'Literal'
                ? String(entry.key.value)
                : '';
          if (!name.startsWith('aria-')) continue;
          if (!ariaQuery.aria.has(name)) {
            context.report({ node: entry.key, messageId: 'unknown', data: { name } });
          }
        }
      },
    };
  },
};
