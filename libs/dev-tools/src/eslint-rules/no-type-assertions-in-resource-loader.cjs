const CORE_RESOURCE_NAMES = new Set(['asyncProcess', 'mutation', 'query']);
const EFFECT_RESOURCE_NAMES = new Set([
  'asyncProcessEffect',
  'mutationEffect',
  'queryEffect',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep query, mutation, and asyncProcess loaders inferred instead of hiding their contract behind type assertions.',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not use a type assertion inside a resource loader. Fix the request or adapter typing and let the query/mutation infer its result.',
    },
  },

  create(context) {
    const resourceNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;

        const source = node.source.value;
        const allowed =
          source === '@craft-ts/core'
            ? CORE_RESOURCE_NAMES
            : source === '@craft-ts/effect'
              ? EFFECT_RESOURCE_NAMES
              : undefined;
        if (!allowed) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = getIdentifierName(specifier.imported);
          if (imported && allowed.has(imported)) {
            resourceNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !resourceNames.has(node.callee.name)
        ) {
          return;
        }

        const config = findConfigArgument(node);
        if (!config || config.type !== 'ObjectExpression') return;

        for (const property of config.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            getPropertyName(property.key) !== 'loader'
          ) {
            continue;
          }

          reportAssertions(property.value, context);
        }
      },
    };
  },
};

function findConfigArgument(node) {
  return node.arguments.find(
    (argument) => argument.type === 'ObjectExpression',
  );
}

function reportAssertions(node, context) {
  walk(node, (child) => {
    if (child.type !== 'TSAsExpression' && child.type !== 'TSTypeAssertion') {
      return;
    }

    context.report({ node: child, messageId: 'forbidden' });
  });
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function getPropertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, visitor);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visitor);
    }
  }
}
