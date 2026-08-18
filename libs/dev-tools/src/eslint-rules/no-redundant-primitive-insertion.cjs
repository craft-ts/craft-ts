const CORE_PACKAGE = '@craft-ts/core';
const EFFECT_PACKAGE = '@craft-ts/effect';
const ANGULAR_PACKAGE = '@angular/core';

const PRIMITIVES = new Set([
  'asyncProcess',
  'asyncProcessEffect',
  'mutation',
  'mutationEffect',
  'query',
  'queryEffect',
]);

const INSERTION_PIPES = new Set([
  'insertAsyncProcessPipe',
  'insertMutationPipe',
  'insertQueryPipe',
]);

const NATIVE_PROPERTIES = new Set(['hasValue', 'isLoading', 'status', 'value']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow insertion properties that only duplicate a primitive resource property.',
    },
    schema: [],
    messages: {
      redundant:
        "'{{property}}' is already provided by the primitive; do not re-declare it in an insertion without additional logic.",
    },
  },

  create(context) {
    const primitiveBindings = new Map();
    const pipeBindings = new Map();
    const computedBindings = new Map();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;

        const source = node.source.value;
        if (
          source !== CORE_PACKAGE &&
          source !== EFFECT_PACKAGE &&
          source !== ANGULAR_PACKAGE
        ) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind === 'type'
          ) {
            continue;
          }

          const importedName = getIdentifierName(specifier.imported);
          if (!importedName) continue;

          if (
            (source === CORE_PACKAGE || source === EFFECT_PACKAGE) &&
            PRIMITIVES.has(importedName)
          ) {
            primitiveBindings.set(specifier.local.name, importedName);
          }

          if (source === CORE_PACKAGE && INSERTION_PIPES.has(importedName)) {
            pipeBindings.set(specifier.local.name, importedName);
          }

          if (
            (source === CORE_PACKAGE && importedName === 'craftComputed') ||
            (source === ANGULAR_PACKAGE && importedName === 'computed')
          ) {
            computedBindings.set(specifier.local.name, importedName);
          }
        }
      },

      FunctionExpression(node) {
        inspectInsertionCallback(node);
      },

      ArrowFunctionExpression(node) {
        inspectInsertionCallback(node);
      },
    };

    function inspectInsertionCallback(node) {
      if (!isInsertionCallback(node, primitiveBindings, pipeBindings)) {
        return;
      }

      const resourceParameter = getResourceParameter(node);
      if (!resourceParameter) return;

      const object = getReturnedObject(node);
      if (!object) return;

      for (const property of object.properties) {
        if (
          property.type !== 'Property' ||
          property.computed ||
          property.kind !== 'init'
        ) {
          continue;
        }

        const propertyName = getPropertyName(property.key);
        if (!propertyName || !NATIVE_PROPERTIES.has(propertyName)) continue;

        const computed = getComputedCall(property.value, computedBindings);
        if (
          !computed ||
          (computed.name !== undefined && computed.name !== propertyName)
        ) {
          continue;
        }

        const read = getReturnedResourceRead(
          computed.callback,
          resourceParameter,
        );
        if (read === propertyName) {
          context.report({
            node: property,
            messageId: 'redundant',
            data: { property: propertyName },
          });
        }
      }
    }
  },
};

function isInsertionCallback(node, primitiveBindings, pipeBindings) {
  const parent = node.parent;
  if (!parent || parent.type !== 'CallExpression') return false;

  const callee = parent.callee;
  if (callee.type !== 'Identifier') return false;

  return primitiveBindings.has(callee.name) || pipeBindings.has(callee.name);
}

function getResourceParameter(node) {
  for (const parameter of node.params) {
    if (parameter.type !== 'ObjectPattern') continue;

    for (const property of parameter.properties) {
      if (
        property.type !== 'Property' ||
        property.computed ||
        getPropertyName(property.key) !== 'resource'
      ) {
        continue;
      }

      const value = property.value;
      if (value.type === 'Identifier') return value.name;
    }
  }

  return undefined;
}

function getReturnedObject(node) {
  const body = unwrap(node.body);
  if (body.type === 'ObjectExpression') return body;
  if (body.type !== 'BlockStatement') return undefined;

  const returnStatement = body.body.find(
    (statement) => statement.type === 'ReturnStatement',
  );
  return returnStatement?.argument
    ? getObjectExpression(returnStatement.argument)
    : undefined;
}

function getObjectExpression(node) {
  const expression = unwrap(node);
  return expression.type === 'ObjectExpression' ? expression : undefined;
}

function getComputedCall(node, computedBindings) {
  const call = unwrap(node);
  if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier') {
    return undefined;
  }

  const importedName = computedBindings.get(call.callee.name);
  if (importedName === 'craftComputed') {
    const name = getStringLiteral(call.arguments[0]);
    const callback = call.arguments[call.arguments.length - 1];
    return name && callback && isFunction(callback)
      ? { name, callback }
      : undefined;
  }

  if (importedName === 'computed') {
    const callback = call.arguments[0];
    return callback && isFunction(callback)
      ? { name: undefined, callback }
      : undefined;
  }

  return undefined;
}

function getReturnedResourceRead(node, resourceParameter) {
  const body = unwrap(node.body);
  if (body.type === 'BlockStatement') {
    const returnStatement = body.body.find(
      (statement) => statement.type === 'ReturnStatement',
    );
    if (!returnStatement?.argument) return undefined;

    const directRead = getResourceRead(
      returnStatement.argument,
      resourceParameter,
    );
    if (directRead) return directRead;

    const statusVariable = getStatusVariable(body, resourceParameter);
    return isCanonicalIsLoading(returnStatement.argument, statusVariable)
      ? 'isLoading'
      : undefined;
  }

  return getResourceRead(body, resourceParameter);
}

function getStatusVariable(body, resourceParameter) {
  for (const statement of body.body) {
    if (
      statement.type !== 'VariableDeclaration' ||
      statement.declarations.length !== 1
    ) {
      continue;
    }

    const declaration = statement.declarations[0];
    if (declaration.id.type !== 'Identifier') continue;
    if (getResourceRead(declaration.init, resourceParameter) !== 'status') {
      continue;
    }

    return declaration.id.name;
  }

  return undefined;
}

function getResourceRead(node, resourceParameter) {
  let expression = unwrap(node);
  if (!expression) return undefined;
  if (expression.type === 'YieldExpression') {
    expression = unwrap(expression.argument);
  }
  if (!expression) return undefined;

  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.computed ||
    expression.callee.object.type !== 'Identifier' ||
    expression.callee.object.name !== resourceParameter ||
    expression.callee.property.type !== 'Identifier' ||
    expression.arguments.length !== 0
  ) {
    return undefined;
  }

  return expression.callee.property.name;
}

function isCanonicalIsLoading(node, statusVariable) {
  if (!statusVariable) return false;

  const expression = unwrap(node);
  if (expression.type !== 'LogicalExpression' || expression.operator !== '||') {
    return false;
  }

  const values = [
    getStatusComparison(expression.left, statusVariable),
    getStatusComparison(expression.right, statusVariable),
  ];
  return values.includes('loading') && values.includes('reloading');
}

function getStatusComparison(node, statusVariable) {
  const expression = unwrap(node);
  if (
    expression.type !== 'BinaryExpression' ||
    !['===', '=='].includes(expression.operator)
  ) {
    return undefined;
  }

  if (
    expression.left.type === 'Identifier' &&
    expression.left.name === statusVariable
  ) {
    return getStringLiteral(expression.right);
  }

  if (
    expression.right.type === 'Identifier' &&
    expression.right.name === statusVariable
  ) {
    return getStringLiteral(expression.left);
  }

  return undefined;
}

function isFunction(node) {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  );
}

function getPropertyName(node) {
  if (node.type === 'Identifier') return node.name;
  return getStringLiteral(node);
}

function getStringLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
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
