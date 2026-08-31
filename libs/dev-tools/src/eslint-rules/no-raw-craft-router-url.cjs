module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require typed route helpers instead of reading the raw CraftRouter URL.',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not read CraftRouter.url. Use the typed route parameter helper (for example AppProductIdParams) instead of parsing the URL.',
    },
  },

  create(context) {
    const craftRouterNames = new Set();
    const craftRouterNamespaces = new Set();
    const routerVariables = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'CraftRouter'
          ) {
            craftRouterNames.add(specifier.local.name);
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            craftRouterNamespaces.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && isCraftRouterYield(node.init)) {
          for (const property of node.id.properties) {
            if (
              property.type === 'Property' &&
              getIdentifierName(property.key) === 'url'
            ) {
              context.report({ node: property.key, messageId: 'forbidden' });
            }
          }
          return;
        }

        if (node.id.type !== 'Identifier') return;

        if (isCraftRouterYield(node.init)) {
          routerVariables.add(node.id.name);
          return;
        }

        // Preserve the guard through a trivial local alias:
        // `const route = router; route.url`.
        if (node.init?.type === 'Identifier' && routerVariables.has(node.init.name)) {
          routerVariables.add(node.id.name);
        }
      },

      MemberExpression(node) {
        if (!isUrlProperty(node)) return;

        const object = unwrap(node.object);
        if (
          (object.type === 'Identifier' && routerVariables.has(object.name)) ||
          isCraftRouterYield(object)
        ) {
          context.report({ node: node.property, messageId: 'forbidden' });
        }
      },
    };

    function isCraftRouterYield(node) {
      const expression = unwrap(node);
      return Boolean(
        expression?.type === 'YieldExpression' &&
          expression.delegate &&
          expression.argument?.type === 'CallExpression' &&
          isCraftRouterCall(expression.argument.callee),
      );
    }

    function isCraftRouterCall(callee) {
      return (
        (callee.type === 'Identifier' && craftRouterNames.has(callee.name)) ||
        (callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          craftRouterNamespaces.has(callee.object.name) &&
          getIdentifierName(callee.property) === 'CraftRouter')
      );
    }
  },
};

function isUrlProperty(node) {
  return Boolean(
    node.computed
      ? node.property.type === 'Literal' && node.property.value === 'url'
      : node.property.type === 'Identifier' && node.property.name === 'url',
  );
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}
