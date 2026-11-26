module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require craftComponent results to keep their inferred component type, and forbid typing a component by hand with CraftComponent<…>.',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      forbidden:
        'Do not annotate a craftComponent result. Keep the inferred type so its dependency and template contracts remain available.',
      erasedAnnotation:
        'Do not type a component with CraftComponent<…>: the annotation drops its dependency contract, its exceptions and its heading need, and DI proofs then refuse it. Keep the inferred type, or seal it at the boundary with sealComponent(Component) to keep every contract without the template tree.',
      erasedAssertion:
        'Do not assert a component to CraftComponent<…>: the assertion drops its dependency contract, its exceptions and its heading need, and DI proofs then refuse it. Keep the inferred type, or seal it at the boundary with sealComponent(Component) to keep every contract without the template tree.',
      removeAnnotation: 'Remove the annotation and keep the inferred type.',
    },
  },

  create(context) {
    const craftComponentNames = new Set();
    const sealComponentNames = new Set();
    const craftComponentTypeNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/component') return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = getIdentifierName(specifier.imported);
          if (imported === 'craftComponent') {
            craftComponentNames.add(specifier.local.name);
          } else if (imported === 'sealComponent') {
            sealComponentNames.add(specifier.local.name);
          } else if (imported === 'CraftComponent') {
            craftComponentTypeNames.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !node.id.typeAnnotation) return;
        const annotation = node.id.typeAnnotation;

        if (isCraftComponentExpression(node.init)) {
          context.report({
            node: annotation,
            messageId: 'forbidden',
            fix(fixer) {
              return fixer.remove(annotation);
            },
          });
          return;
        }

        // `const Panel: CraftComponent<Props> = PanelImpl` — the value is not
        // visible from here, but the annotation alone is the problem: it
        // replaces whatever the component was with a type that has no contract.
        if (isCraftComponentType(annotation.typeAnnotation)) {
          context.report({
            node: annotation,
            messageId: 'erasedAnnotation',
            suggest: [
              {
                messageId: 'removeAnnotation',
                fix(fixer) {
                  return fixer.remove(annotation);
                },
              },
            ],
          });
        }
      },

      'TSAsExpression, TSTypeAssertion'(node) {
        if (!isCraftComponentType(node.typeAnnotation)) return;
        context.report({ node: node.typeAnnotation, messageId: 'erasedAssertion' });
      },
    };

    /**
     * A craftComponent call, the same component piped (`craftComponent(…)
     * .pipe(…)`) or sealed (`sealComponent(craftComponent(…))`).
     */
    function isCraftComponentExpression(node) {
      const expression = unwrap(node);
      if (expression?.type !== 'CallExpression') return false;
      const { callee } = expression;
      if (callee.type === 'Identifier') {
        if (craftComponentNames.has(callee.name)) return true;
        if (sealComponentNames.has(callee.name)) {
          return isCraftComponentExpression(expression.arguments[0]);
        }
        return false;
      }
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        getIdentifierName(callee.property) === 'pipe' &&
        isCraftComponentExpression(callee.object)
      );
    }

    function isCraftComponentType(node) {
      return Boolean(
        node?.type === 'TSTypeReference' &&
          node.typeName.type === 'Identifier' &&
          craftComponentTypeNames.has(node.typeName.name),
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
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}
