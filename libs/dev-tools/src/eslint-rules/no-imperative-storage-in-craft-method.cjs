const CORE_PACKAGE = '@craft-ts/core';

const STORAGE_METHODS = new Set([
  'getItem',
  'setItem',
  'removeItem',
  'clear',
  'key',
  'length',
]);

const LOCATION_METHODS = new Set(['reload', 'assign', 'replace']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct storage and imperative location access inside a craftMethod.',
    },
    schema: [],
    messages: {
      storage:
        'Direct storage access is forbidden inside a craftMethod. React to the mutation from the affected query with insertReactOnMutation(...), use optimisticUpdate: () => undefined when the value must be cleared, and let persistence follow the query state.',
      location:
        'Imperative BrowserLocation.{{method}}(...) is forbidden inside a craftMethod. React to the authentication or query state instead of reloading or navigating from the handler.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const craftMethodNames = new Set(['craftMethod']);
    const craftServiceNames = new Set(['craftService']);
    const storageObjectNames = new Set([
      'localStorage',
      'sessionStorage',
      'storage',
      'storageService',
    ]);
    const locationObjectNames = new Set(['location']);
    const localStorageNames = new Set(['LocalStorage', 'SessionStorage']);
    const storageServiceNames = new Set([
      'LocalStorageService',
      'SessionStorageService',
    ]);
    const locationNames = new Set(['BrowserLocation']);
    const locationServiceNames = new Set(['BrowserLocationService']);
    const namespaceNames = new Set();
    const craftMethodCalls = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceNames.add(specifier.local.name);
            continue;
          }
          if (specifier.type !== 'ImportSpecifier') continue;

          const importedName = getIdentifierName(specifier.imported);
          const localName = specifier.local.name;
          if (importedName === 'craftMethod') craftMethodNames.add(localName);
          if (importedName === 'craftService') craftServiceNames.add(localName);
          if (localStorageNames.has(importedName)) {
            localStorageNames.add(localName);
          }
          if (storageServiceNames.has(importedName)) {
            storageServiceNames.add(localName);
          }
          if (locationNames.has(importedName)) locationNames.add(localName);
          if (locationServiceNames.has(importedName)) {
            locationServiceNames.add(localName);
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') return;
        if (isCreatedFrom(node.init, storageServiceNames)) {
          storageObjectNames.add(node.id.name);
        }
        if (isCreatedFrom(node.init, locationServiceNames)) {
          locationObjectNames.add(node.id.name);
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

          walk(callback.body, (child) => {
            if (child.type !== 'CallExpression') return;

            const storageAction = getStorageAction(child);
            if (storageAction) {
              context.report({ node: child, messageId: 'storage' });
              return;
            }

            const locationAction = getLocationAction(child);
            if (locationAction) {
              context.report({
                node: child,
                messageId: 'location',
                data: { method: locationAction },
              });
            }
          });
        }
      },
    };

    function getStorageAction(node) {
      const member = getMember(node);
      if (!member || !STORAGE_METHODS.has(member.property)) return false;

      return isStorageObject(member.object);
    }

    function getLocationAction(node) {
      const member = getMember(node);
      if (!member || !LOCATION_METHODS.has(member.property)) return undefined;

      if (isLocationObject(member.object)) return member.property;
      return undefined;
    }

    function isStorageObject(node) {
      if (node.type !== 'Identifier') return false;
      if (localStorageNames.has(node.name)) return true;
      if (storageObjectNames.has(node.name)) {
        return node.name === 'storage' || node.name === 'storageService'
          ? true
          : isGlobalReference(node);
      }
      return false;
    }

    function isLocationObject(node) {
      if (node.type === 'Identifier') {
        if (
          locationNames.has(node.name) ||
          locationObjectNames.has(node.name)
        ) {
          return locationNames.has(node.name) || isGlobalReference(node);
        }
        return false;
      }

      return (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.object.type === 'Identifier' &&
        namespaceNames.has(node.object.name) &&
        node.property.type === 'Identifier' &&
        locationNames.has(node.property.name)
      );
    }

    function isGlobalReference(node) {
      let scope = sourceCode.getScope(node);
      while (scope) {
        const reference = scope.references.find(
          (candidate) => candidate.identifier === node,
        );
        if (reference) {
          return (
            reference.resolved == null || reference.resolved.defs.length === 0
          );
        }
        scope = scope.upper;
      }
      return false;
    }
  },
};

function getMember(node) {
  if (node.callee.type !== 'MemberExpression') return undefined;

  const property = node.callee.computed
    ? node.callee.property.type === 'Literal'
      ? String(node.callee.property.value)
      : undefined
    : node.callee.property.type === 'Identifier'
      ? node.callee.property.name
      : undefined;

  return property ? { object: node.callee.object, property } : undefined;
}

function isCreatedFrom(node, names) {
  let current = node;
  while (current) {
    if (current.type === 'YieldExpression') {
      current = current.argument;
      continue;
    }
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'ChainExpression'
    ) {
      current = current.expression;
      continue;
    }
    if (current.type !== 'CallExpression') return false;
    return (
      current.callee.type === 'Identifier' && names.has(current.callee.name)
    );
  }
  return false;
}

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
