'use strict';

const { parseHyperscriptCall, hasProp } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require title on iframe elements.',
    },
    schema: [],
    messages: {
      missingTitle: '<iframe> must have a title that describes the framed content.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || call.tag !== 'iframe') return;
        if (hasProp(call.props, 'title')) return;
        context.report({ node, messageId: 'missingTitle' });
      },
    };
  },
};
