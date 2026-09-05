module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow TypeScript type assertions in Craft code so values keep their inferred contracts.',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not use a TypeScript type assertion here. Fix the value or API typing and let TypeScript infer the contract; use `satisfies` when you need to validate a shape without changing the value type.',
    },
  },

  create(context) {
    return {
      TSAsExpression(node) {
        if (!isAllowedUndefinedSeedAssertion(node)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },

      TSTypeAssertion(node) {
        if (!isAllowedUndefinedSeedAssertion(node)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

function isAllowedUndefinedSeedAssertion(node) {
  return (
    node.expression?.type === 'Identifier' &&
    node.expression.name === 'undefined' &&
    node.typeAnnotation?.type === 'TSUnionType' &&
    node.typeAnnotation.types.some((type) => type.type === 'TSUndefinedKeyword')
  );
}
