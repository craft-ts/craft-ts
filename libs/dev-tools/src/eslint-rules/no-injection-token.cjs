const MESSAGE =
  "Do not use InjectionToken in app code. Declare the contract with craftService({ name: '...', providedIn: 'abstract' }, abstract<Contract>()) instead.";

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow authored InjectionToken contracts in favor of abstract craftService contracts.',
    },
    schema: [],
    messages: {
      forbidden: MESSAGE,
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const importedNames = new Set();
    const namespaceNames = new Set();
    const reportedImportNames = new Set();
    const reportedNodes = new Set();

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'InjectionToken'
          ) {
            importedNames.add(specifier.local.name);
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceNames.add(specifier.local.name);
          }
        }
      },

      NewExpression(node) {
        const tokenNode = getInjectionTokenNode(
          node.callee,
          importedNames,
          namespaceNames,
          sourceCode,
        );
        if (!tokenNode) {
          return;
        }

        report(context, tokenNode, reportedNodes);
        if (tokenNode.type === 'Identifier') {
          reportedImportNames.add(tokenNode.name);
        }
      },

      TSTypeReference(node) {
        const tokenNode = getInjectionTokenNode(
          node.typeName,
          importedNames,
          namespaceNames,
          sourceCode,
        );
        if (tokenNode) {
          report(context, tokenNode, reportedNodes);
          if (tokenNode.type === 'Identifier') {
            reportedImportNames.add(tokenNode.name);
          }
        }
      },

      'Program:exit'() {
        for (const name of importedNames) {
          if (reportedImportNames.has(name)) {
            continue;
          }

          const specifier = findInjectionTokenImport(
            sourceCode.ast,
            name,
          );
          if (specifier) {
            report(context, specifier, reportedNodes);
          }
        }
      },
    };
  },
};

function getInjectionTokenNode(
  node,
  importedNames,
  namespaceNames,
  sourceCode,
) {
  if (
    node.type === 'Identifier' &&
    (importedNames.has(node.name) ||
      (node.name === 'InjectionToken' && isUnshadowed(node, sourceCode)))
  ) {
    return node;
  }

  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    namespaceNames.has(node.object.name) &&
    node.property.type === 'Identifier' &&
    node.property.name === 'InjectionToken'
  ) {
    return node.property;
  }

  if (
    node.type === 'TSQualifiedName' &&
    node.left.type === 'Identifier' &&
    namespaceNames.has(node.left.name) &&
    node.right.type === 'Identifier' &&
    node.right.name === 'InjectionToken'
  ) {
    return node.right;
  }

  return undefined;
}

function findInjectionTokenImport(program, localName) {
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.local.name === localName &&
        specifier.imported.type === 'Identifier' &&
        specifier.imported.name === 'InjectionToken'
      ) {
        return specifier;
      }
    }
  }

  return undefined;
}

function report(context, node, reportedNodes) {
  if (reportedNodes.has(node)) {
    return;
  }

  reportedNodes.add(node);
  context.report({ node, messageId: 'forbidden' });
}

function isUnshadowed(node, sourceCode) {
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
