const CORE_PACKAGE = '@craft-ts/core';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep remote reads and writes in query or mutation loaders instead of craftMethod.',
    },
    schema: [],
    messages: {
      forbidden:
        'Remote work via CraftHttpClient.{{method}}(...) is forbidden inside craftMethod. Put the request directly in a query or mutation loader.',
    },
  },

  create(context) {
    const craftMethodNames = new Set(['craftMethod']);
    const httpClientNames = new Set(['CraftHttpClient']);
    const craftMethodCallbacks = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;

          const imported = getIdentifierName(specifier.imported);
          if (imported === 'craftMethod') {
            craftMethodNames.add(specifier.local.name);
          }
          if (imported === 'CraftHttpClient') {
            httpClientNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !craftMethodNames.has(node.callee.name)
        ) {
          return;
        }

        const callback = [...node.arguments].reverse().find(isFunction);
        if (callback) craftMethodCallbacks.push(callback);
      },

      'Program:exit'() {
        for (const callback of craftMethodCallbacks) {
          walk(callback.body, (node) => {
            if (
              node.type !== 'CallExpression' ||
              node.callee.type !== 'MemberExpression' ||
              node.callee.object.type !== 'Identifier' ||
              !httpClientNames.has(node.callee.object.name)
            ) {
              return;
            }

            const method = getPropertyName(
              node.callee.property,
              node.callee.computed,
            );
            if (!method) return;

            context.report({
              node: node.callee,
              messageId: 'forbidden',
              data: { method },
            });
          });
        }
      },
    };
  },
};

function isFunction(node) {
  return (
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  );
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function getPropertyName(node, computed) {
  if (!computed && node.type === 'Identifier') return node.name;
  if (computed && node.type === 'Literal' && typeof node.value === 'string') {
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
