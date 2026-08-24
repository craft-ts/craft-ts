'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Reject widened string or any provider contexts in RouteCheckedDI.',
    },
    schema: [],
  },
  create(context) {
    return {
      TSTypeReference(node) {
        if (
          node.typeName.type !== 'Identifier' ||
          node.typeName.name !== 'RouteCheckedDI'
        ) {
          return;
        }
        const availableNames = node.typeArguments?.params?.[1];
        if (!isWidened(availableNames)) return;
        context.report({
          node: availableNames,
          message:
            'RouteCheckedDI provider names are widened to string/any. Restore the inferred app provider type; do not bypass the check with a broad fallback.',
        });
      },
    };
  },
};

function isWidened(node) {
  if (!node) return false;
  if (node.type === 'TSStringKeyword' || node.type === 'TSAnyKeyword') {
    return true;
  }
  return node.type === 'TSUnionType' && node.types.some(isWidened);
}
