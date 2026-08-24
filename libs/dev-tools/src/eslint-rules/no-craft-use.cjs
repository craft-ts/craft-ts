module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid the synchronous craftUse escape hatch in Craft TypeScript files.',
    },
    schema: [],
    messages: {
      forbidden:
        '`craftUse(...)` is forbidden in Craft TypeScript. Use a generator and delegate the reader with `yield*` instead.',
    },
  },

  create(context) {
    const craftUseNames = new Set(['craftUse']);

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'craftUse'
          ) {
            craftUseNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          craftUseNames.has(node.callee.name)
        ) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};
