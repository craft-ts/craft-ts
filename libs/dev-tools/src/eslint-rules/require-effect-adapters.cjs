const ADAPTERS = {
  query: 'queryEffect',
  mutation: 'mutationEffect',
  asyncProcess: 'asyncProcessEffect',
  transitionGuard: 'transitionGuardEffect',
};

function isExemptFile(filename) {
  return (
    /(?:^|[/\\])libs[/\\]effect[/\\]/.test(filename) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(filename)
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Effect-aware Craft adapters in the demo-effect application.',
    },
    schema: [],
    messages: {
      direct: 'Use {{adapter}}(...) in demo-effect instead of {{primitive}}(...).\nEffect demos must use the Effect-aware CraftTS adapters.',
    },
  },
  create(context) {
    if (isExemptFile(context.filename ?? '')) {
      return {};
    }

    const directImports = new Map();
    const directCalls = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind === 'type'
          ) {
            continue;
          }

          const imported =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;
          if (!Object.hasOwn(ADAPTERS, imported)) continue;

          directImports.set(specifier.local.name, imported);
          context.report({
            node: specifier,
            messageId: 'direct',
            data: { adapter: ADAPTERS[imported], primitive: imported },
          });
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !directImports.has(node.callee.name)
        ) {
          return;
        }

        directCalls.push(node);
      },

      'Program:exit'() {
        for (const node of directCalls) {
          const primitive = directImports.get(node.callee.name);
          if (!primitive) continue;

          context.report({
            node: node.callee,
            messageId: 'direct',
            data: { adapter: ADAPTERS[primitive], primitive },
          });
        }
      },
    };
  },
};
