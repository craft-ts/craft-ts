'use strict';

const ariaQuery = require('aria-query');
const { parseHyperscriptCall, hasProp, staticPropString } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require ARIA properties that a role declares as required.',
    },
    schema: [],
    messages: {
      missing:
        'role="{{role}}" requires {{prop}}.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call) return;
        const role = staticPropString(call.props, 'role');
        if (!role) return;
        const definition = ariaQuery.roles.get(role);
        if (!definition?.requiredProps) return;
        for (const prop of Object.keys(definition.requiredProps)) {
          if (hasProp(call.props, prop)) continue;
          context.report({
            node,
            messageId: 'missing',
            data: { role, prop },
          });
        }
      },
    };
  },
};
