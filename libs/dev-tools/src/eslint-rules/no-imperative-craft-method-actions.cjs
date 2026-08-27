const CORE_PACKAGE = '@craft-ts/core';

const IMPERATIVE_ACTIONS = new Map([
  ['call', 'query.call'],
  ['mutate', 'mutation.mutate'],
  ['method', 'asyncProcess.method'],
  ['set', 'state.set'],
  ['update', 'state.update'],
  ['reset', 'state.reset'],
  ['restore', 'state.restore'],
  ['unset', 'state.unset'],
  ['emit', 'source$.emit'],
  ['setItem', 'storage.setItem'],
  ['removeItem', 'storage.removeItem'],
  ['clear', 'storage.clear'],
  ['reload', 'resource.reload'],
  ['assign', 'BrowserLocation.assign'],
  ['replace', 'BrowserLocation.replace'],
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow composing multiple imperative actions inside a craftMethod.',
    },
    schema: [],
    messages: {
      multiple:
        'craftMethod composes multiple imperative actions ({{actions}}). Emit a source$ event and let the affected query react with insertReactOnMutation(...).',
    },
  },

  create(context) {
    const craftMethodNames = new Set(['craftMethod']);
    const craftServiceNames = new Set(['craftService']);
    const craftMethodCalls = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const importedName = getIdentifierName(specifier.imported);
            if (importedName === 'craftMethod') {
              craftMethodNames.add(specifier.local.name);
            }
            if (importedName === 'craftService') {
              craftServiceNames.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (!isCraftMethodCall(node, craftMethodNames)) return;
        craftMethodCalls.push(node);
      },

      'Program:exit'() {
        for (const node of craftMethodCalls) {
          if (isInsideCraftService(node, craftServiceNames)) continue;

          const callback = [...node.arguments].reverse().find(isFunction);
          if (!callback) continue;

          const actions = [];
          walk(callback.body, (child) => {
            if (child.type !== 'CallExpression') return;

            const action = getImperativeAction(child);
            if (action) actions.push({ node: child, action });
          });

          if (actions.length < 2) continue;

          context.report({
            node: actions[1].node,
            messageId: 'multiple',
            data: {
              actions: actions.map(({ action }) => action).join(', '),
            },
          });
        }
      },
    };
  },
};

function isCraftMethodCall(node, names) {
  return node.callee.type === 'Identifier' && names.has(node.callee.name);
}

function isInsideCraftService(node, names) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      names.has(current.callee.name)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function getImperativeAction(node) {
  if (node.callee.type !== 'MemberExpression') return undefined;

  const property = node.callee.computed
    ? node.callee.property.type === 'Literal'
      ? String(node.callee.property.value)
      : undefined
    : node.callee.property.type === 'Identifier'
      ? node.callee.property.name
      : undefined;

  return property ? IMPERATIVE_ACTIONS.get(property) : undefined;
}

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
