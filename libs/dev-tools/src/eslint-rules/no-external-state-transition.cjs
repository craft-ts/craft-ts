const CORE_PACKAGE = '@craft-ts/core';
const GENERIC_MUTATORS = new Set(['replace', 'set', 'update', 'patch']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep state transitions inside the Craft state that owns the value.',
    },
    schema: [],
    messages: {
      externalTransition:
        "Do not write a computed value through '{{owner}}.{{method}}' outside its state factory. Add a named state command that accepts the intent and computes the transition internally.",
    },
  },

  create(context) {
    const stateFactoryNames = new Set();
    const namespaceNames = new Set();
    const sourceCode = context.sourceCode;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const imported = getIdentifierName(specifier.imported);
            if (imported === 'state') stateFactoryNames.add(specifier.local.name);
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (isStateFactoryCall(node, stateFactoryNames, namespaceNames)) return;

        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        const method = getPropertyName(callee);
        if (!method || !GENERIC_MUTATORS.has(method)) return;
        if (callee.object.type !== 'Identifier') return;

        const scope = sourceCode.getScope(node);
        const ownerVariable = findVariable(scope, callee.object.name);
        if (!variableIsState(ownerVariable, stateFactoryNames, namespaceNames))
          return;

        const stateDefinition = ownerVariable.defs.find((definition) =>
          isStateFactoryInitializer(
            definition.node?.init,
            stateFactoryNames,
            namespaceNames,
          ),
        );
        if (isInsideStateFactory(node, stateDefinition)) return;

        context.report({
          node: callee,
          messageId: 'externalTransition',
          data: { owner: callee.object.name, method },
        });
      },
    };
  },
};

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}

function getPropertyName(member) {
  if (!member.computed) return getIdentifierName(member.property);
  if (member.property.type === 'Literal' && typeof member.property.value === 'string')
    return member.property.value;
  return undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  if (current?.type === 'YieldExpression' && current.delegate)
    current = unwrap(current.argument);
  return current;
}

function isStateFactoryCall(node, stateFactoryNames, namespaceNames) {
  const callee = node.callee;
  if (callee.type === 'Identifier') return stateFactoryNames.has(callee.name);
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    namespaceNames.has(callee.object.name) &&
    getIdentifierName(callee.property) === 'state'
  );
}

function isStateFactoryInitializer(initializer, stateFactoryNames, namespaceNames) {
  const current = unwrap(initializer);
  return (
    current?.type === 'CallExpression' &&
    isStateFactoryCall(current, stateFactoryNames, namespaceNames)
  );
}

function findVariable(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set?.get(name);
    if (variable) return variable;
  }
  return undefined;
}

function variableIsState(variable, stateFactoryNames, namespaceNames, seen = new Set()) {
  if (!variable || seen.has(variable)) return false;
  seen.add(variable);
  return variable.defs.some((definition) => {
    const initializer = definition.node?.init;
    if (!initializer) return false;
    if (isStateFactoryInitializer(initializer, stateFactoryNames, namespaceNames))
      return true;
    const source = unwrap(initializer);
    if (source?.type !== 'Identifier') return false;
    return variableIsState(
      findVariable(variable.scope, source.name),
      stateFactoryNames,
      namespaceNames,
      seen,
    );
  });
}

function isInsideStateFactory(node, definition) {
  const stateCall = unwrap(definition?.node?.init);
  const insertion = stateCall?.arguments?.[2];
  return Boolean(
    insertion &&
      node.range[0] >= insertion.range[0] &&
      node.range[1] <= insertion.range[1],
  );
}
