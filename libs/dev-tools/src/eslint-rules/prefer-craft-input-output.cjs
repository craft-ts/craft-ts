const ANGULAR_CORE = '@angular/core';

const ANGULAR_INPUT_OUTPUT_APIS = new Map([
  ['input', 'input'],
  ['output', 'output'],
  ['outputFromObservable', 'output'],
  ['outputFromSubscribable', 'output'],
  ['Input', 'input'],
  ['Output', 'output'],
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer Craft component Input and Output dependencies over Angular input/output APIs and decorators.',
    },
    schema: [],
    messages: {
      input:
        'Angular input()/@Input is forbidden in authored Craft code. Declare the dependency with Input from @craft-ng/component in craftComponent(...).',
      output:
        'Angular output()/@Output is forbidden in authored Craft code. Declare the dependency with Output from @craft-ng/component in craftComponent(...).',
    },
  },

  create(context) {
    const localApis = new Map();
    const namespaceImports = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== ANGULAR_CORE) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceImports.add(specifier.local.name);
            continue;
          }

          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.imported.type !== 'Identifier'
          ) {
            continue;
          }

          const kind = ANGULAR_INPUT_OUTPUT_APIS.get(specifier.imported.name);
          if (!kind) {
            continue;
          }

          localApis.set(specifier.local.name, kind);
          context.report({ node: specifier, messageId: kind });
        }
      },

      CallExpression(node) {
        if (isInsideDecorator(node)) {
          return;
        }

        const kind = getDirectApiKind(node, localApis);
        if (kind) {
          context.report({ node: node.callee, messageId: kind });
          return;
        }

        const namespaceKind = getNamespaceApiKind(node, namespaceImports);
        if (namespaceKind) {
          context.report({
            node: node.callee.property,
            messageId: namespaceKind,
          });
        }
      },

      Decorator(node) {
        const decorator = node.expression;
        const callee =
          decorator.type === 'CallExpression' ? decorator.callee : decorator;

        if (callee.type === 'Identifier') {
          const kind = localApis.get(callee.name);
          if (kind) {
            context.report({ node: callee, messageId: kind });
          }
          return;
        }

        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          namespaceImports.has(callee.object.name) &&
          callee.property.type === 'Identifier'
        ) {
          const kind = ANGULAR_INPUT_OUTPUT_APIS.get(callee.property.name);
          if (kind) {
            context.report({ node: callee.property, messageId: kind });
          }
        }
      },
    };
  },
};

function getDirectApiKind(node, localApis) {
  if (node.callee.type === 'Identifier') {
    return localApis.get(node.callee.name);
  }

  if (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier'
  ) {
    return localApis.get(node.callee.object.name);
  }

  return undefined;
}

function isInsideDecorator(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'Decorator') {
      return true;
    }
    if (
      current.type === 'PropertyDefinition' ||
      current.type === 'MethodDefinition' ||
      current.type === 'ClassDeclaration'
    ) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

function getNamespaceApiKind(node, namespaceImports) {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.computed ||
    node.callee.property.type !== 'Identifier'
  ) {
    return undefined;
  }

  if (
    node.callee.object.type === 'Identifier' &&
    namespaceImports.has(node.callee.object.name)
  ) {
    return ANGULAR_INPUT_OUTPUT_APIS.get(node.callee.property.name);
  }

  if (
    node.callee.object.type === 'MemberExpression' &&
    !node.callee.object.computed &&
    node.callee.object.object.type === 'Identifier' &&
    namespaceImports.has(node.callee.object.object.name) &&
    node.callee.object.property.type === 'Identifier'
  ) {
    return ANGULAR_INPUT_OUTPUT_APIS.get(node.callee.object.property.name);
  }

  return undefined;
}
