const ACTION_METHODS = new Set([
  'set',
  'update',
  'call',
  'mutate',
  'method',
  'emit',
  'next',
  'dispatch',
  'send',
  'watch',
  'stop',
  'start',
  'clear',
  'delete',
  'add',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require mutable Craft actions to be resolved through dependency injection or passed as explicit inputs.',
      url: 'https://craft-ts.github.io/craft/guide/routing/eslint-rules',
    },
    schema: [],
    messages: {
      action:
        'Do not {{method}} imported `{{name}}`; resolve its owner through `yield*` in a craftService or pass the required capability as an explicit function input.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        const callee = unwrap(node.callee);
        if (callee?.type !== 'MemberExpression') return;
        const method = propertyName(callee.property);
        if (!method || !ACTION_METHODS.has(method)) return;
        const object = rootIdentifier(callee.object);
        if (!object) return;
        if (!isImportedBinding(object, sourceCode)) return;
        if (
          method === 'delete' &&
          isImportedNamedBinding(
            object,
            '@craft-ts/core',
            'CraftHttpClient',
            sourceCode,
          )
        ) {
          return;
        }

        context.report({
          node: callee,
          messageId: 'action',
          data: {
            method,
            name: object.name,
          },
        });
      },
    };
  },
};

function isImportedBinding(identifier, sourceCode) {
  return findImportedDefinition(identifier, sourceCode) !== undefined;
}

function isImportedNamedBinding(
  identifier,
  moduleName,
  importedName,
  sourceCode,
) {
  const definition = findImportedDefinition(identifier, sourceCode);
  if (!definition) return false;
  const imported =
    definition.node.imported?.name ?? definition.node.imported?.value;
  return (
    definition.parent?.source?.value === moduleName && imported === importedName
  );
}

function findImportedDefinition(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    if (variable) {
      return variable.defs.find(
        (definition) => definition.type === 'ImportBinding',
      );
    }
    scope = scope.upper;
  }
  return undefined;
}

function propertyName(node) {
  if (!node) return undefined;
  if (!node.computed && node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function rootIdentifier(node) {
  let current = unwrap(node);
  while (current?.type === 'MemberExpression') {
    current = unwrap(current.object);
  }
  return current?.type === 'Identifier' ? current : undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    [
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'ParenthesizedExpression',
      'ChainExpression',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}
