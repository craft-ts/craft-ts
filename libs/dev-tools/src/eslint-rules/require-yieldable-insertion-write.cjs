const WRITE_METHODS = new Set(['set', 'patch', 'update']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require set, patch, and update insertion writes to be delegated with yield* inside generator functions.',
    },
    schema: [],
    messages: {
      requireYield:
        'Insertion writes through set(...), patch(...), and update(...) must be delegated with `yield*` inside a generator function.',
    },
  },

  create(context) {
    const insertionWriteBindings = new Set();

    return {
      FunctionDeclaration: collectInsertionWriteBindings,
      FunctionExpression: collectInsertionWriteBindings,
      ArrowFunctionExpression: collectInsertionWriteBindings,

      CallExpression(node) {
        if (
          !isInsideGeneratorFunction(node) ||
          isDelegated(node) ||
          !isInsertionWrite(node)
        ) {
          return;
        }

        context.report({ node, messageId: 'requireYield' });
      },
    };

    function isInsertionWrite(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier') {
        return insertionWriteBindings.has(callee.name);
      }
      return false;
    }

    function collectInsertionWriteBindings(node) {
      for (const parameter of node.params) {
        if (parameter.type !== 'ObjectPattern') continue;

        for (const property of parameter.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            property.key.type !== 'Identifier'
          ) {
            continue;
          }

          const key = property.key.name;
          if (!WRITE_METHODS.has(key)) continue;

          if (property.value.type === 'Identifier') {
            insertionWriteBindings.add(property.value.name);
          }
        }
      }
    }

  },
};

function isInsideGeneratorFunction(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'ArrowFunctionExpression') return false;
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return current.generator === true;
    }
    current = current.parent;
  }
  return false;
}

function isDelegated(node) {
  let parent = node.parent;
  while (
    parent &&
    ['ChainExpression', 'TSAsExpression', 'TSTypeAssertion'].includes(
      parent.type,
    )
  ) {
    parent = parent.parent;
  }
  return parent?.type === 'YieldExpression' && parent.delegate === true;
}
