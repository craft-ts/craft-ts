'use strict';

const { parseHyperscriptCall, hasProp, staticPropString } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require rel="noopener" (or noreferrer) when target="_blank".',
    },
    schema: [],
    messages: {
      missing:
        'target="_blank" requires rel to include "noopener" (or "noreferrer").',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call) return;
        const target = staticPropString(call.props, 'target');
        if (target !== '_blank') return;
        const rel = staticPropString(call.props, 'rel') ?? '';
        if (/\bnoopener\b/.test(rel) || /\bnoreferrer\b/.test(rel)) return;
        if (hasProp(call.props, 'rel') && !rel) return;
        context.report({ node, messageId: 'missing' });
      },
    };
  },
};
