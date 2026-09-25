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
    const directImportNodes = new Map();
    const serverFunctionClients = new Set();
    const directCalls = [];

    return {
      ImportDeclaration(node) {
        if (
          typeof node.source.value === 'string' &&
          node.source.value.endsWith('starter.fn-client')
        ) {
          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier') {
              serverFunctionClients.add(specifier.local.name);
            }
          }
        }
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
          directImportNodes.set(specifier.local.name, specifier);
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
        const isServerFunctionQuery = (node) => {
          if (
            directImports.get(node.callee.name) !== 'query' ||
            serverFunctionClients.size === 0
          ) {
            return false;
          }
          const config = node.arguments[1];
          if (!config || config.type !== 'ObjectExpression') return false;
          const loader = config.properties.find(
            (property) =>
              property.type === 'Property' &&
              ((property.key.type === 'Identifier' && property.key.name === 'loader') ||
                (property.key.type === 'Literal' && property.key.value === 'loader')),
          );
          if (!loader || loader.type !== 'Property') return false;
          const loaderText = context.sourceCode.getText(loader.value);
          return Array.from(serverFunctionClients).some((client) =>
            new RegExp(`yield\\*\\s*${client}\\s*\\(`).test(loaderText),
          );
        };

        for (const [local, primitive] of directImports) {
          const calls = directCalls.filter((node) => node.callee.name === local);
          if (calls.length > 0 && calls.every(isServerFunctionQuery)) continue;
          const specifier = directImportNodes.get(local);
          if (!specifier) continue;
          context.report({
            node: specifier,
            messageId: 'direct',
            data: { adapter: ADAPTERS[primitive], primitive },
          });
        }

        for (const node of directCalls) {
          const primitive = directImports.get(node.callee.name);
          if (!primitive || isServerFunctionQuery(node)) continue;

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
