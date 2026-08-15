'use strict';

const { parseHyperscriptCall, hasProp } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require alt on img and area, including an empty string for decorative images.',
    },
    schema: [],
    messages: {
      missingAlt:
        '<{{tag}}> must have an alt attribute (use alt: \'\' for decorative images).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || (call.tag !== 'img' && call.tag !== 'area')) return;
        if (hasProp(call.props, 'alt')) return;
        context.report({ node, messageId: 'missingAlt', data: { tag: call.tag } });
      },
    };
  },
};
