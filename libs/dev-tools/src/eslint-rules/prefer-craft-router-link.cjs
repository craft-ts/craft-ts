'use strict';

const {
  parseHyperscriptCall,
  hasProp,
  staticPropString,
  hasCraftRouterLinkPipe,
} = require('./hyperscript-walk.cjs');

const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

function isExternalHref(href) {
  // Fragment-only links stay in the current document and do not navigate to
  // another Craft route.
  return href.startsWith('#') || href.startsWith('//') || URL_SCHEME.test(href);
}

function hasNativeNavigationIntent(call) {
  return (
    staticPropString(call.props, 'target') === '_blank' ||
    hasProp(call.props, 'download') ||
    staticPropString(call.props, 'data-navigation') === 'external'
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require CraftRouterLink for internal anchor navigation while allowing intentional native navigation.',
    },
    schema: [],
    messages: {
      internal:
        'Use .pipe(CraftRouterLink({ to: ... })) for internal navigation instead of a native href.',
      dynamic:
        'Use .pipe(CraftRouterLink({ to: ... })) for dynamic navigation, or mark intentional native navigation with data-navigation="external".',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || call.tag !== 'a' || !hasProp(call.props, 'href')) return;
        if (hasCraftRouterLinkPipe(node) || hasNativeNavigationIntent(call)) {
          return;
        }

        const href = staticPropString(call.props, 'href');
        if (href !== undefined && isExternalHref(href)) return;
        context.report({
          node,
          messageId: href === undefined ? 'dynamic' : 'internal',
        });
      },
    };
  },
};
