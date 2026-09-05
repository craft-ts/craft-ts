const INSERTION_PIPE_NAMES = new Set([
  'insertStatePipe',
  'insertQueryPipe',
  'insertMutationPipe',
  'insertAsyncProcessPipe',
  'insertQueryParamsPipe',
  'insertStateMachinePipe',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow explicit callback annotations in Craft insertion pipes so primitive output and dependency types remain inferred.',
    },
    schema: [],
    messages: {
      parameter:
        'Do not annotate an insertion callback parameter explicitly: the Craft insertion pipe provides its context and must be allowed to infer it.',
      return:
        'Do not annotate an insertion callback return type explicitly: Craft must infer the derived output so the primitive keeps its complete type.',
    },
  },

  create(context) {
    const insertionPipeNames = new Set();

    return {
      ImportDeclaration(node) {
        if (
          node.importKind === 'type' ||
          node.source.value !== '@craft-ts/core'
        ) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = getIdentifierName(specifier.imported);
          if (imported && INSERTION_PIPE_NAMES.has(imported)) {
            insertionPipeNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !insertionPipeNames.has(node.callee.name)
        ) {
          return;
        }

        for (const argument of node.arguments) {
          const callback = unwrap(argument);
          if (!isFunction(callback)) continue;

          for (const parameter of callback.params) {
            const annotation = getParameterTypeAnnotation(parameter);
            if (annotation) {
              context.report({ node: annotation, messageId: 'parameter' });
            }
          }

          if (callback.returnType) {
            context.report({ node: callback.returnType, messageId: 'return' });
          }
        }
      },
    };
  },
};

function getParameterTypeAnnotation(parameter) {
  if (parameter.type === 'AssignmentPattern') {
    return getParameterTypeAnnotation(parameter.left);
  }
  return parameter.typeAnnotation;
}

function isFunction(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    [
      'ChainExpression',
      'ParenthesizedExpression',
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
