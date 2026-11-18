const COMPONENT_MODULE = '@craft-ts/component';
const CORE_MODULE = '@craft-ts/core';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep reactive derivations in craftService view models instead of craftComponent factories.',
    },
    schema: [],
    messages: {
      moveToService:
        'Do not declare craftComputed in a craftComponent factory. Move reactive derivations into a craftService and expose them to the component.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const componentNames = new Set();
    const componentNamespaces = new Set();
    const computedNames = new Set();
    const coreNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value === COMPONENT_MODULE) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              importedName(specifier.imported) === 'craftComponent'
            ) {
              componentNames.add(specifier.local.name);
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              componentNamespaces.add(specifier.local.name);
            }
          }
        }

        if (node.source.value === CORE_MODULE) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              importedName(specifier.imported) === 'craftComputed'
            ) {
              computedNames.add(specifier.local.name);
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              coreNamespaces.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (!isCraftComponent(node)) return;
        const factory = node.arguments[2];
        if (!factory) return;

        walk(factory, (candidate) => {
          if (candidate !== factory && isCraftComponent(candidate)) return 'skip';
          if (isCraftComputed(candidate)) {
            context.report({ node: candidate, messageId: 'moveToService' });
          }
        });
      },
    };

    function isCraftComponent(node) {
      return isImportedCall(
        node,
        componentNames,
        componentNamespaces,
        'craftComponent',
      );
    }

    function isCraftComputed(node) {
      return isImportedCall(node, computedNames, coreNamespaces, 'craftComputed');
    }

    function isImportedCall(node, namedImports, namespaces, imported) {
      if (node?.type !== 'CallExpression') return false;
      const callee = node.callee;
      if (callee.type === 'Identifier') return namedImports.has(callee.name);
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        namespaces.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        callee.property.name === imported
      );
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;
      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
        else walk(child, visit);
      }
    }
  },
};

function importedName(node) {
  return node.type === 'Identifier' ? node.name : node.value;
}
