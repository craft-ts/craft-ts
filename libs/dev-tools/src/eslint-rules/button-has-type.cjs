'use strict';

const { parseHyperscriptCall, hasProp } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an explicit type on button() so it cannot silently submit a parent form.',
    },
    schema: [],
    fixable: 'code',
    messages: {
      missingType:
        'button() must set type ("button", "submit", or "reset"). Craft does not default it.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || call.tag !== 'button') return;
        if (hasProp(call.props, 'type')) return;
        context.report({
          node,
          messageId: 'missingType',
          fix(fixer) {
            if (call.props && call.props.type === 'ObjectExpression') {
              const open = call.props.range[0];
              return fixer.insertTextAfterRange(
                [open, open + 1],
                " type: 'button',",
              );
            }
            const firstArg = node.arguments[0];
            if (firstArg) {
              return fixer.insertTextBefore(firstArg, "{ type: 'button' }, ");
            }
            const paren = node.range[1] - 1;
            return fixer.insertTextBeforeRange(
              [paren, paren],
              "{ type: 'button' }",
            );
          },
        });
      },
    };
  },
};
