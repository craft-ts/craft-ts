'use strict';

const { NAMED_HTML_HELPER_SET } = require('./html-helpers.cjs');
const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid h()/customElement() for tags that have a named Craft HTML helper, so types and a11y rules cannot be bypassed.',
    },
    schema: [],
    messages: {
      preferHelper:
        "Use the named helper {{helper}}(...) instead of {{callee}}('{{tag}}'). Named helpers carry a11y types and lint.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || (call.via !== 'h' && call.via !== 'customElement')) return;
        if (!call.tag || !NAMED_HTML_HELPER_SET.has(call.tag)) return;
        context.report({
          node: call.tagNode ?? node,
          messageId: 'preferHelper',
          data: { helper: call.tag, callee: call.callee, tag: call.tag },
        });
      },
    };
  },
};
