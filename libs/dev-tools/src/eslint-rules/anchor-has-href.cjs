'use strict';

const { parseHyperscriptCall, hasProp, staticPropString } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require href on anchors, or an interactive role plus keyboard handling if the element is a button in disguise.',
    },
    schema: [],
    messages: {
      missingHref:
        '<a> must have href, or role="button" with click and keydown (prefer a real <button>).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || call.tag !== 'a') return;
        if (hasProp(call.props, 'href') || hasProp(call.props, 'craftRouterLink')) return;
        const role = staticPropString(call.props, 'role');
        const hasClick = hasProp(call.props, 'click') || hasProp(call.props, 'onClick');
        const hasKey =
          hasProp(call.props, 'keydown') ||
          hasProp(call.props, 'onKeydown') ||
          hasProp(call.props, 'keypress');
        if (role === 'button' && hasClick && hasKey) return;
        context.report({ node, messageId: 'missingHref' });
      },
    };
  },
};
