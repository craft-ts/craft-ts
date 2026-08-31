const CORE_PACKAGE = '@craft-ts/core';
const EFFECT_PACKAGE = '@craft-ts/effect';

const RESOURCE_PRIMITIVES = new Set([
  'query',
  'queryEffect',
  'asyncProcess',
  'asyncProcessEffect',
]);

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer queryParams over state values used as query or asyncProcess params.',
    },
    schema: [],
    messages: {
      stateInParams:
        "Resource params for {{primitive}}(...) depend on state '{{states}}'. Prefer queryParams(...) for values that should survive reloads and be represented in the URL.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const stateFactories = new Set();
    const derivedFactories = new Set();
    const resourceFactories = new Map();
    const bindings = new Map();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const packageName = node.source.value;
        if (packageName !== CORE_PACKAGE && packageName !== EFFECT_PACKAGE) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind === 'type'
          ) {
            continue;
          }

          const imported = getIdentifierName(specifier.imported);
          if (imported === 'state' && packageName === CORE_PACKAGE) {
            stateFactories.add(specifier.local.name);
          }
          if (imported === 'craftComputed' && packageName === CORE_PACKAGE) {
            derivedFactories.add(specifier.local.name);
          }
          if (RESOURCE_PRIMITIVES.has(imported)) {
            resourceFactories.set(specifier.local.name, imported);
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !node.init) return;
        const initializer = unwrapExpression(node.init);
        if (!initializer) return;

        if (
          initializer.type === 'ArrowFunctionExpression' ||
          initializer.type === 'FunctionExpression'
        ) {
          bindings.set(node.id.name, { kind: 'utility', node });
          return;
        }
        if (initializer.type !== 'CallExpression') return;

        const callee = initializer.callee;
        if (callee.type !== 'Identifier') return;

        if (stateFactories.has(callee.name)) {
          bindings.set(node.id.name, {
            kind: 'state',
            name: getStringLiteral(initializer.arguments[0]) ?? node.id.name,
            node,
          });
          return;
        }

        if (derivedFactories.has(callee.name)) {
          bindings.set(node.id.name, { kind: 'derived', node });
          return;
        }

      },

      FunctionDeclaration(node) {
        if (node.id) bindings.set(node.id.name, { kind: 'utility', node });
      },

      'Program:exit'() {
        walkResourceCalls(sourceCode.ast, (primitive, paramsProperty) => {
          const states = collectStateDependencies(
            paramsProperty.value,
            bindings,
            sourceCode,
          );
          if (states.size === 0) return;

          context.report({
            node: paramsProperty,
            messageId: 'stateInParams',
            data: {
              primitive,
              states: [...states].sort().join(', '),
            },
          });
        }, resourceFactories);
      },
    };
  },
};

function walkResourceCalls(node, callback, resourceFactories) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
    const primitive = resourceFactories.get(node.callee.name);
    if (primitive) {
      for (const argument of node.arguments) {
        if (argument.type !== 'ObjectExpression') continue;
        const params = argument.properties.find(
          (property) =>
            property.type === 'Property' &&
            !property.computed &&
            getPropertyName(property.key) === 'params',
        );
        if (params && params.type === 'Property') {
          callback(primitive, params);
          break;
        }
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkResourceCalls(item, callback, resourceFactories);
    } else if (child && typeof child === 'object' && child.type) {
      walkResourceCalls(child, callback, resourceFactories);
    }
  }
}

function collectStateDependencies(node, bindings, sourceCode, visited = new Set()) {
  const states = new Set();
  const collectInto = (current) => {
    if (!current || typeof current !== 'object') return;
    if (current.type === 'Identifier') {
      const variable = resolveVariable(current);
      if (variable) visitBinding(variable);
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent') continue;
      const child = current[key];
      if (Array.isArray(child)) {
        for (const item of child) collectInto(item);
      } else if (child && typeof child === 'object' && child.type) {
        collectInto(child);
      }
    }
  };

  const resolveVariable = (identifier) => {
    let scope = sourceCode.getScope(identifier);
    while (scope) {
      const variable = scope.set?.get(identifier.name);
      if (variable) return variable;
      scope = scope.upper;
    }
    return undefined;
  };

  const visitBinding = (variable) => {
    if (!variable || visited.has(variable)) return;
    visited.add(variable);
    const binding = bindings.get(variable.name);
    if (!binding) return;
    if (binding.kind === 'state') {
      states.add(binding.name);
      return;
    }

    const body = bindingBody(binding.node);
    if (body) collectInto(body);
  };

  collectInto(node);
  return states;
}

function bindingBody(node) {
  if (!node) return undefined;
  if (node.type === 'VariableDeclarator') {
    const initializer = unwrapExpression(node.init);
    if (initializer?.type === 'CallExpression') {
      const callback = initializer.arguments.find(
        (argument) =>
          argument.type === 'ArrowFunctionExpression' ||
          argument.type === 'FunctionExpression',
      );
      return callback?.body;
    }
    if (
      initializer?.type === 'ArrowFunctionExpression' ||
      initializer?.type === 'FunctionExpression'
    ) {
      return initializer.body;
    }
  }
  if (node.type === 'FunctionDeclaration') return node.body;
  return undefined;
}

function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (current.type === 'YieldExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.argument ?? current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}

function getStringLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function getPropertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  return getStringLiteral(node);
}
