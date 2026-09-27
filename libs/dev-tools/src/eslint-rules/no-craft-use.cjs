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
    // A named primitive is a generator; outside a generator (an insertion
    // factory, a plain arrow) `craftUse(craftComputed(...))` is the only way to
    // consume it, and the one `require-primitive-generator-unwrap` asks for.
    // It reads no reactive value, so it is not the escape hatch this forbids.
    const primitiveNames = new Map([
      ['craftComputed', 'craftComputed'],
      ['craftMethod', 'craftMethod'],
      ['craftEffect', 'craftEffect'],
    ]);

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.imported.type !== 'Identifier'
          ) {
            continue;
          }
          if (specifier.imported.name === 'craftUse') {
            craftUseNames.add(specifier.local.name);
          }
          if (
            ['craftComputed', 'craftMethod', 'craftEffect'].includes(
              specifier.imported.name,
            )
          ) {
            primitiveNames.set(specifier.local.name, specifier.imported.name);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          craftUseNames.has(node.callee.name)
        ) {
          if (unwrapsPrimitiveGenerator(node)) return;
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };

    function unwrapsPrimitiveGenerator(node) {
      const [argument] = node.arguments;
      return (
        node.arguments.length === 1 &&
        argument.type === 'CallExpression' &&
        argument.callee.type === 'Identifier' &&
        primitiveNames.has(argument.callee.name)
      );
    }
  },
};
