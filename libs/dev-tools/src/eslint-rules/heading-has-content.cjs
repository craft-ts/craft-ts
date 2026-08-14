'use strict';

const { HEADING_HELPERS } = require('./html-helpers.cjs');
const { parseHyperscriptCall, hasAccessibleName, staticTextContent } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require heading helpers and heading() to have accessible content.',
    },
    schema: [],
    messages: {
      empty: '<{{tag}}> must have text content, aria-label, or aria-labelledby.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call) return;
        const tag = call.tag;
        if (!tag) return;
        if (!HEADING_HELPERS.has(tag) && tag !== 'heading') return;
        if (hasAccessibleName(call)) return;
        if (staticTextContent(call.children).trim().length > 0) return;
        context.report({ node, messageId: 'empty', data: { tag } });
      },
    };
  },
};
