const CORE_PRIMITIVE_NAMES = new Set([
  'state',
  'query',
  'mutation',
  'asyncProcess',
  'queryParam',
  'queryParams',
]);

const EFFECT_PRIMITIVE_NAMES = new Set([
  'queryEffect',
  'mutationEffect',
  'asyncProcessEffect',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow chained type assertions around Craft primitive generators so their inferred output and dependencies are preserved.',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not cast a Craft primitive generator through another type (for example `as unknown as Generator<...>`). Remove the assertions and keep the primitive contract inferred from its configuration and insertions.',
    },
  },

  create(context) {
    const primitiveNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;

        const allowed =
          node.source.value === '@craft-ts/core'
            ? CORE_PRIMITIVE_NAMES
            : node.source.value === '@craft-ts/effect'
              ? EFFECT_PRIMITIVE_NAMES
              : undefined;
        if (!allowed) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = getIdentifierName(specifier.imported);
          if (imported && allowed.has(imported)) {
            primitiveNames.add(specifier.local.name);
          }
        }
      },

      TSAsExpression(node) {
        const inner = unwrapParens(node.expression);
        if (inner?.type !== 'TSAsExpression') return;

        const primitiveCall = unwrapParens(inner.expression);
        if (!isPrimitiveCall(primitiveCall, primitiveNames)) return;

        context.report({ node, messageId: 'forbidden' });
      },

      TSTypeAssertion(node) {
        const inner = unwrapParens(node.expression);
        if (
          inner?.type !== 'TSAsExpression' &&
          inner?.type !== 'TSTypeAssertion'
        ) {
          return;
        }

        const primitiveCall = unwrapParens(inner.expression);
        if (!isPrimitiveCall(primitiveCall, primitiveNames)) return;

        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};

function isPrimitiveCall(node, primitiveNames) {
  return Boolean(
    node?.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      primitiveNames.has(node.callee.name),
  );
}

function unwrapParens(node) {
  let current = node;
  while (
    current &&
    ['ChainExpression', 'ParenthesizedExpression'].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
