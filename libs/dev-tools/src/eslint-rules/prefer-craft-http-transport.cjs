const GLOBAL_OBJECTS = new Set(['globalThis', 'window']);

const FETCH_MESSAGE =
  'Do not call fetch() directly in authored Craft code. Use query() for reads or mutation() for writes, backed by CraftHttpClient.';
const XHR_MESSAGE =
  'Do not use XMLHttpRequest directly in authored Craft code. Use query() for reads or mutation() for writes, backed by CraftHttpClient.';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer Craft query/mutation primitives backed by CraftHttpClient over fetch and XMLHttpRequest.',
    },
    schema: [],
    messages: {
      fetch: FETCH_MESSAGE,
      xhr: XHR_MESSAGE,
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (isDirectGlobalCall(node, 'fetch', sourceCode)) {
          context.report({ node: node.callee, messageId: 'fetch' });
          return;
        }

        if (isGlobalObjectCall(node, 'fetch', sourceCode)) {
          context.report({ node: node.callee.property, messageId: 'fetch' });
        }
      },

      NewExpression(node) {
        if (isDirectGlobalConstructor(node, 'XMLHttpRequest', sourceCode)) {
          context.report({ node: node.callee, messageId: 'xhr' });
          return;
        }

        if (isGlobalObjectConstructor(node, 'XMLHttpRequest', sourceCode)) {
          context.report({ node: node.callee.property, messageId: 'xhr' });
        }
      },
    };
  },
};

function isDirectGlobalCall(node, name, sourceCode) {
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === name &&
    isUnshadowedGlobal(node.callee, sourceCode)
  );
}

function isGlobalObjectCall(node, name, sourceCode) {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    GLOBAL_OBJECTS.has(node.callee.object.name) &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === name &&
    isUnshadowedGlobal(node.callee.object, sourceCode)
  );
}

function isDirectGlobalConstructor(node, name, sourceCode) {
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === name &&
    isUnshadowedGlobal(node.callee, sourceCode)
  );
}

function isGlobalObjectConstructor(node, name, sourceCode) {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    GLOBAL_OBJECTS.has(node.callee.object.name) &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === name &&
    isUnshadowedGlobal(node.callee.object, sourceCode)
  );
}

function isUnshadowedGlobal(node, sourceCode) {
  let scope = sourceCode.getScope(node);

  while (scope) {
    const variable = scope.set?.get(node.name);
    if (variable) {
      return variable.defs.length === 0;
    }
    scope = scope.upper;
  }

  return true;
}
