const CORE_PACKAGE = '@craft-ts/core';
const EFFECT_PACKAGE = '@craft-ts/effect';

const PRIMITIVES = new Set([
  'asyncProcess',
  'asyncProcessEffect',
  'mutation',
  'mutationEffect',
  'query',
  'queryEffect',
  'queryParams',
  'state',
]);

const INSERTION_PIPES = new Set([
  'insertAsyncProcessPipe',
  'insertMutationPipe',
  'insertQueryParamsPipe',
  'insertQueryPipe',
  'insertStatePipe',
]);

const INSERTION_CONTEXT_KEYS = new Set([
  'insertions',
  'patch',
  'resource',
  'set',
  'state',
  'update',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow using an exposed primitive insertion method at multiple call sites in one file.',
    },
    schema: [],
    messages: {
      reused:
        "Primitive method '{{method}}' is used at multiple call sites in this file. Create one method per call site.",
    },
  },

  create(context) {
    const primitiveNames = new Map();
    const pipeNames = new Set();
    const primitiveBindings = new Map();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const source = node.source.value;
        if (source !== CORE_PACKAGE && source !== EFFECT_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind === 'type'
          ) {
            continue;
          }
          const imported = getIdentifierName(specifier.imported);
          if (!imported) continue;
          if (PRIMITIVES.has(imported)) {
            primitiveNames.set(specifier.local.name, imported);
          }
          if (source === CORE_PACKAGE && INSERTION_PIPES.has(imported)) {
            pipeNames.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        const primitiveCall = getPrimitiveCall(node.init, primitiveNames);
        if (!primitiveCall) return;

        const methods = getExposedMethods(primitiveCall, pipeNames);
        if (methods.size === 0) return;

        if (node.id.type === 'Identifier') {
          const binding = {
            id: `${node.id.name}:${node.init.range?.[0] ?? node.start}`,
            name: node.id.name,
            primitive: primitiveCall.primitive,
            methods,
          };
          primitiveBindings.set(node.id.name, binding);
          return;
        }

        if (node.id.type !== 'ObjectPattern') return;
        for (const property of node.id.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            property.value.type !== 'Identifier'
          ) {
            continue;
          }
          const binding = {
            id: `${property.value.name}:${node.init.range?.[0] ?? node.start}`,
            name: property.value.name,
            primitive: primitiveCall.primitive,
            methods,
          };
          primitiveBindings.set(property.value.name, binding);
        }
      },

      'Program:exit'(program) {
        resolvePrimitiveAliases(program, primitiveBindings);

        const usages = new Map();
        walk(program, (node) => {
          if (node.type !== 'MemberExpression' || node.computed && node.property.type !== 'Literal') {
            return;
          }

          const object = node.object;
          if (object.type !== 'Identifier') return;
          const binding = primitiveBindings.get(object.name);
          if (!binding) return;

          const method = getPropertyName(node.property);
          if (!method || !binding.methods.has(method)) return;

          const key = `${binding.id}:${method}`;
          const sites = usages.get(key) ?? [];
          sites.push({ node, binding, method });
          usages.set(key, sites);
        });

        for (const [, sites] of usages) {
          if (sites.length <= 1) continue;
          const first = sites[0];
          for (const site of sites.slice(1)) {
            context.report({
              node: site.node,
              messageId: 'reused',
              data: {
                method: `${first.binding.name}.${first.method}`,
              },
            });
          }
        }
      },
    };
  },
};

function getPrimitiveCall(node, primitiveNames) {
  let current = unwrap(node);
  if (current?.type === 'YieldExpression') current = unwrap(current.argument);
  if (current?.type !== 'CallExpression' || current.callee.type !== 'Identifier') {
    return undefined;
  }
  const primitive = primitiveNames.get(current.callee.name);
  return primitive ? { node: current, primitive } : undefined;
}

function getExposedMethods(primitiveCall, pipeNames) {
  const methods = new Set();
  for (const argument of primitiveCall.node.arguments.slice(2)) {
    collectInsertionMethods(argument, pipeNames, methods);
  }
  return methods;
}

function collectInsertionMethods(node, pipeNames, methods) {
  const current = unwrap(node);
  if (!current) return;

  if (isFunction(current) && isInsertionCallback(current)) {
    const returned = getReturnedObject(current);
    for (const property of returned?.properties ?? []) {
      if (property.type !== 'Property' || property.computed) continue;
      if (isFunction(property.value)) {
        const name = getPropertyName(property.key);
        if (name) methods.add(name);
      }
    }
    return;
  }

  if (
    current.type === 'CallExpression' &&
    current.callee.type === 'Identifier' &&
    pipeNames.has(current.callee.name)
  ) {
    for (const argument of current.arguments) {
      collectInsertionMethods(argument, pipeNames, methods);
    }
  }
}

function isInsertionCallback(node) {
  const parameter = node.params[0];
  if (!parameter || parameter.type !== 'ObjectPattern') return false;
  return parameter.properties.some(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      INSERTION_CONTEXT_KEYS.has(getPropertyName(property.key)),
  );
}

function getReturnedObject(node) {
  const body = unwrap(node.body);
  if (body.type === 'ObjectExpression') return body;
  if (body.type !== 'BlockStatement') return undefined;
  const returned = body.body.find(
    (statement) => statement.type === 'ReturnStatement',
  );
  return returned?.argument ? getObjectExpression(returned.argument) : undefined;
}

function getObjectExpression(node) {
  const expression = unwrap(node);
  return expression?.type === 'ObjectExpression' ? expression : undefined;
}

function resolvePrimitiveAliases(program, primitiveBindings) {
  let changed = true;
  while (changed) {
    changed = false;
    walk(program, (node) => {
      if (
        node.type !== 'VariableDeclarator' ||
        node.id.type !== 'Identifier' ||
        node.init?.type !== 'Identifier'
      ) {
        return;
      }
      const binding = primitiveBindings.get(node.init.name);
      if (binding && !primitiveBindings.has(node.id.name)) {
        primitiveBindings.set(node.id.name, binding);
        changed = true;
      }
    });
  }
}

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' || node?.type === 'ArrowFunctionExpression'
  );
}

function getPropertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, visitor);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visitor);
    }
  }
}
