const CORE_PACKAGE = '@craft-ts/core';

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer route-level queryParams over component-local state for filters.',
    },
    schema: [],
    messages: {
      filter:
        "'{{name}}' looks like filter state. Declare it with route-level queryParams and feed the query reactively instead of keeping it in state().",
    },
  },

  create(context) {
    const stateNames = new Set(['state']);

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE || node.importKind === 'type') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'state'
          ) {
            stateNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !stateNames.has(node.callee.name)
        ) {
          return;
        }

        const name = getStringLiteral(node.arguments[0]);
        if (!name || !looksLikeFilter(name)) return;

        context.report({
          node: node.arguments[0] ?? node,
          messageId: 'filter',
          data: { name },
        });
      },
    };
  },
};

function looksLikeFilter(name) {
  return /(?:^|[_-])filters?(?:$|[_-])|filters?$|filters?[A-Z]/i.test(name);
}

function getStringLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
