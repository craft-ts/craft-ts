'use strict';

const PAGE_STATE_NAMES = new Set([
  'page',
  'currentPage',
  'activePage',
  'routePage',
]);

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when a string-valued page state may duplicate Craft route activation.',
    },
    schema: [],
    messages: {
      pageState:
        "State '{{name}}' stores a page-like string. If it selects which app page is shown, use provideCraftRouter(...) and CraftRouterOutlet(); keep local state for pagination or page-specific UI state.",
    },
  },

  create(context) {
    const stateFactories = new Set(['state', 'createStateBridge']);

    return {
      ImportDeclaration(node) {
        if (
          node.source.value !== '@craft-ts/core' ||
          node.importKind === 'type'
        ) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'state'
          ) {
            stateFactories.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        const callee = unwrap(node.callee);
        if (callee?.type !== 'Identifier' || !stateFactories.has(callee.name)) {
          return;
        }

        const name = getStringLiteral(node.arguments[0]);
        if (!name || !PAGE_STATE_NAMES.has(name)) return;

        const hasStringInitialValue =
          getStringLiteral(node.arguments[1]) !== undefined;
        const hasStringUnion = node.typeArguments?.params?.some(
          (parameter) => collectStringLiteralTypes(parameter).length > 0,
        );
        if (!hasStringInitialValue && !hasStringUnion) return;

        context.report({
          node: node.arguments[0],
          messageId: 'pageState',
          data: { name },
        });
      },
    };
  },
};

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}

function getStringLiteral(node) {
  const expression = unwrap(node);
  return expression?.type === 'Literal' && typeof expression.value === 'string'
    ? expression.value
    : undefined;
}

function collectStringLiteralTypes(node) {
  if (!node) return [];
  if (node.type === 'TSUnionType') {
    return node.types.flatMap(collectStringLiteralTypes);
  }
  if (
    node.type === 'TSLiteralType' &&
    node.literal?.type === 'Literal' &&
    typeof node.literal.value === 'string'
  ) {
    return [node.literal.value];
  }
  return [];
}
