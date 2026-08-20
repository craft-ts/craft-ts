const CORE_PACKAGE = '@craft-ts/core';

const TRANSITION_ACTIONS = new Map([
  ['call', 'query.call'],
  ['mutate', 'mutation.mutate'],
  ['method', 'asyncProcess.method'],
  ['restore', 'state.restore'],
  ['emit', 'source$.emit'],
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow imperative state, query, mutation, and asyncProcess actions inside craftStateMachine transitions.',
    },
    schema: [],
    messages: {
      forbidden:
        'Imperative {{action}}(...) is forbidden inside a transitionStep. Derive a source and let the resource react to it instead.',
    },
  },

  create(context) {
    const transitionStepNames = new Set(['transitionStep']);
    const namespaceNames = new Set();
    const transitionCallbacks = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const importedName = getIdentifierName(specifier.imported);
            if (importedName === 'transitionStep') {
              transitionStepNames.add(specifier.local.name);
            }
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (!isTransitionStepCall(node)) return;

        const callback = node.arguments.find(isFunction);
        if (callback) transitionCallbacks.push(callback);
      },

      'Program:exit'() {
        const reported = new Set();

        for (const callback of transitionCallbacks) {
          walk(callback.body, (node) => {
            if (node.type !== 'CallExpression') return;

            const action = getResourceAction(node);
            if (!action || reported.has(node)) return;

            reported.add(node);
            context.report({
              node,
              messageId: 'forbidden',
              data: { action },
            });
          });
        }
      },
    };

    function isTransitionStepCall(node) {
      if (node.callee.type === 'Identifier') {
        return transitionStepNames.has(node.callee.name);
      }

      return (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object.type === 'Identifier' &&
        namespaceNames.has(node.callee.object.name) &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'transitionStep'
      );
    }
  },
};

function getResourceAction(node) {
  if (node.callee.type !== 'MemberExpression') return undefined;

  const property = node.callee.computed
    ? node.callee.property.type === 'Literal'
      ? String(node.callee.property.value)
      : undefined
    : node.callee.property.name;

  const action = TRANSITION_ACTIONS.get(property);
  return action;
}

function isFunction(node) {
  return (
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  );
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

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
