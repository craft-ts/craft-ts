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
      insideCraftBody:
        '`craftUse({{primitive}}(...))` is forbidden inside `{{owner}}`. Declare the primitive in the generator body with `yield* {{primitive}}(...)` instead.',
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
    // Inside these, a generator body is always within reach: the primitive
    // belongs there, declared with `yield*`, rather than hidden in a nested
    // callback (an insertion, a template prop) where it escapes the owner.
    const ownerNames = new Map([
      ['craftService', 'craftService'],
      ['craftComponent', 'craftComponent'],
      ['craftMethod', 'craftMethod'],
      ['craftEffect', 'craftEffect'],
    ]);

    return {
      ImportDeclaration(node) {
        if (
          node.source.value !== '@craft-ts/core' &&
          node.source.value !== '@craft-ts/component'
        ) {
          return;
        }

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
          if (ownerNames.has(specifier.imported.name)) {
            ownerNames.set(specifier.local.name, specifier.imported.name);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          craftUseNames.has(node.callee.name)
        ) {
          if (!unwrapsPrimitiveGenerator(node)) {
            context.report({ node, messageId: 'forbidden' });
            return;
          }
          const owner = enclosingOwner(node);
          if (owner) {
            context.report({
              node,
              messageId: 'insideCraftBody',
              data: {
                owner,
                primitive: primitiveNames.get(node.arguments[0].callee.name),
              },
            });
          }
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

    function enclosingOwner(node) {
      const ancestors = context.sourceCode.getAncestors(node);
      for (let index = ancestors.length - 1; index >= 0; index--) {
        const ancestor = ancestors[index];
        if (
          ancestor.type === 'CallExpression' &&
          ancestor.callee.type === 'Identifier' &&
          ownerNames.has(ancestor.callee.name)
        ) {
          return ownerNames.get(ancestor.callee.name);
        }
      }
      return undefined;
    }
  },
};
