module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require craftComponent results to keep their inferred component type.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      forbidden:
        'Do not annotate a craftComponent result. Keep the inferred type so its dependency and template contracts remain available.',
    },
  },

  create(context) {
    const craftComponentNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/component') return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'craftComponent'
          ) {
            craftComponentNames.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type !== 'Identifier' ||
          !node.id.typeAnnotation ||
          !isCraftComponentCall(node.init)
        ) {
          return;
        }

        context.report({
          node: node.id.typeAnnotation,
          messageId: 'forbidden',
          fix(fixer) {
            return fixer.remove(node.id.typeAnnotation);
          },
        });
      },
    };

    function isCraftComponentCall(node) {
      const expression = unwrap(node);
      return Boolean(
        expression?.type === 'CallExpression' &&
          expression.callee.type === 'Identifier' &&
          craftComponentNames.has(expression.callee.name),
      );
    }
  },
};

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
