const TEST_FILE = /(?:^|[\\/])__tests__(?:[\\/]|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Discourage synchronous craftUse calls outside test files.',
    },
    schema: [],
    messages: {
      preferYield:
        '`craftUse(...)` is mainly useful at synchronous test boundaries. In business code, prefer a named Craft primitive and `yield*` in its generator; keep `craftUse` for focused synchronous tests.',
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (filename.startsWith('<') || TEST_FILE.test(filename)) return {};

    const craftUseNames = new Set();
    const calls = [];

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
          calls.push(node);
        }
      },
      'Program:exit'() {
        for (const node of calls) {
          context.report({ node, messageId: 'preferYield' });
        }
      },
    };
  },
};
