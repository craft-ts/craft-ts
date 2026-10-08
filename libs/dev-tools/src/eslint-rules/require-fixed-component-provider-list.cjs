const MODULE = '@craft-ts/component';
const HELPER = 'withComponentProviders';
const LIST_METHODS = new Set([
  'map',
  'flatMap',
  'filter',
  'concat',
  'flat',
  'slice',
  'splice',
  'sort',
  'toSorted',
  'reverse',
  'toReversed',
  'toSpliced',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a structurally fixed provider list for each component instance.',
    },
    schema: [],
    messages: {
      fixedList:
        'withComponentProviders requires a concise arrow returning an array literal with fixed entries and order. Choose providers that are always present and pass reactive readers in their configuration instead of varying the list.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (!isHelper(node.callee, sourceCode)) return;
        const factory = node.arguments[0];
        if (
          factory?.type !== 'ArrowFunctionExpression' ||
          factory.async ||
          factory.body.type !== 'ArrayExpression' ||
          !isFixedEntry(factory.body)
        ) {
          context.report({ node: factory ?? node, messageId: 'fixedList' });
        }
      },
    };
  },
};

function unwrap(node) {
  while (
    node &&
    [
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
    ].includes(node.type)
  ) {
    node = node.expression;
  }
  return node;
}

// Inspect the declared list and provider selection only. Provider arguments
// and helper implementations may contain reactive computations of any shape.
function isFixedEntry(raw) {
  const node = unwrap(raw);
  if (!node) return false;
  switch (node.type) {
    case 'ArrayExpression':
      return node.elements.every(isFixedEntry);
    case 'Identifier':
    case 'ObjectExpression':
      return true;
    case 'MemberExpression':
      return !node.computed && isFixedEntry(node.object);
    case 'CallExpression':
      return isFixedCallee(node.callee) && !assemblesList(node.callee);
    default:
      return false;
  }
}

function assemblesList(raw) {
  const callee = unwrap(raw);
  if (callee?.type !== 'MemberExpression') return false;
  const method = callee.computed ? callee.property.value : callee.property.name;
  return (
    LIST_METHODS.has(method) ||
    (callee.object.type === 'Identifier' &&
      callee.object.name === 'Array' &&
      (method === 'of' || method === 'from'))
  );
}

function isFixedCallee(raw) {
  const node = unwrap(raw);
  return (
    node?.type === 'Identifier' ||
    (node?.type === 'MemberExpression' &&
      !node.computed &&
      isFixedCallee(node.object))
  );
}

function isHelper(callee, sourceCode) {
  if (callee.type === 'Identifier') {
    return imported(callee, sourceCode, 'ImportSpecifier');
  }
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    (callee.computed ? callee.property.value : callee.property.name) ===
      HELPER &&
    imported(callee.object, sourceCode, 'ImportNamespaceSpecifier')
  );
}

function imported(identifier, sourceCode, kind) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return variable.defs.some(
        (definition) =>
          definition.type === 'ImportBinding' &&
          definition.parent?.source?.value === MODULE &&
          definition.node.type === kind &&
          (kind === 'ImportNamespaceSpecifier' ||
            (definition.node.imported.name ??
              definition.node.imported.value) === HELPER),
      );
    }
    scope = scope.upper;
  }
  return false;
}
