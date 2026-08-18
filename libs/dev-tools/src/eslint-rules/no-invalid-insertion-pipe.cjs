const CORE_PACKAGE = '@craft-ts/core';

const INSERTION_PIPES = new Set([
  'insertAsyncProcessPipe',
  'insertMutationPipe',
  'insertQueryParamsPipe',
  'insertQueryPipe',
  'insertStatePipe',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require typed insertion pipes to compose multiple meaningful insertions.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      multipleInsertions:
        "'{{name}}' requires at least two insertions. Remove the pipe wrapper when there is only one insertion.",
      noEmptyInsertion:
        "'{{name}}' cannot contain an insertion callback that returns an empty object.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const pipeBindings = new Map();
    const namespaceBindings = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE || node.importKind === 'type') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.importKind === 'type') continue;

          if (specifier.type === 'ImportSpecifier') {
            const importedName = getIdentifierName(specifier.imported);
            if (importedName && INSERTION_PIPES.has(importedName)) {
              pipeBindings.set(specifier.local.name, importedName);
            }
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceBindings.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        const pipeName = getPipeName(
          node.callee,
          pipeBindings,
          namespaceBindings,
        );
        if (!pipeName) return;

        if (node.arguments.length < 2) {
          context.report({
            node,
            messageId: 'multipleInsertions',
            data: { name: pipeName },
            ...(node.arguments.length === 1
              ? {
                  fix(fixer) {
                    return fixer.replaceText(
                      node,
                      sourceCode.getText(node.arguments[0]),
                    );
                  },
                }
              : {}),
          });
        }

        for (const argument of node.arguments) {
          if (!isEmptyInsertionCallback(argument)) continue;

          context.report({
            node: argument,
            messageId: 'noEmptyInsertion',
            data: { name: pipeName },
          });
        }
      },
    };
  },
};

function getPipeName(callee, pipeBindings, namespaceBindings) {
  if (callee.type === 'Identifier') {
    return pipeBindings.get(callee.name);
  }

  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier' ||
    callee.property.type !== 'Identifier' ||
    !namespaceBindings.has(callee.object.name) ||
    !INSERTION_PIPES.has(callee.property.name)
  ) {
    return undefined;
  }

  return callee.property.name;
}

function isEmptyInsertionCallback(node) {
  const callback = unwrap(node);
  if (
    callback.type !== 'ArrowFunctionExpression' &&
    callback.type !== 'FunctionExpression'
  ) {
    return false;
  }

  const body = unwrap(callback.body);
  if (body.type === 'ObjectExpression') {
    return body.properties.length === 0;
  }

  if (body.type !== 'BlockStatement' || body.body.length !== 1) {
    return false;
  }

  const statement = body.body[0];
  return (
    statement.type === 'ReturnStatement' &&
    statement.argument != null &&
    unwrap(statement.argument).type === 'ObjectExpression' &&
    unwrap(statement.argument).properties.length === 0
  );
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    [
      'ChainExpression',
      'TSAsExpression',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
