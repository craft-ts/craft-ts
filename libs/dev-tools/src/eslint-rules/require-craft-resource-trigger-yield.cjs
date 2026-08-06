const PRIMITIVE_METHODS = {
  query: new Set(['call']),
  mutation: new Set(['mutate']),
  asyncProcess: new Set(['method']),
};

const CORE_PACKAGE = '@craft-ng/core';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require query, mutation, and asyncProcess triggers to be consumed with yield* inside generator functions.',
    },
    schema: [],
    messages: {
      requireYield:
        '{{primitive}}.{{method}}(...) must be consumed with `yield*` inside a generator function.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const imported = new Map();
    const primitiveNames = new Map();
    const primitiveRefs = new Map();
    const calls = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          imported.set(specifier.local.name, specifier.imported.name);
          if (PRIMITIVE_METHODS[specifier.imported.name]) {
            primitiveNames.set(
              specifier.local.name,
              specifier.imported.name,
            );
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern') return;
        const primitive = findPrimitiveCreation(node.init);
        if (!primitive) return;

        for (const property of node.id.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            property.value.type !== 'Identifier'
          ) {
            continue;
          }

          primitiveRefs.set(property.value.name, {
            primitive,
            methods: PRIMITIVE_METHODS[primitive],
          });
        }
      },

      CallExpression(node) {
        calls.push(node);
      },

      'Program:exit'() {
        // Resolve simple aliases after all primitive destructuring declarations
        // have been collected (`const q = users`).
        let changed = true;
        while (changed) {
          changed = false;
          walk(sourceCode.ast, (node) => {
            if (
              node.type !== 'VariableDeclarator' ||
              node.id.type !== 'Identifier' ||
              node.init?.type !== 'Identifier'
            ) {
              return;
            }
            const ref = primitiveRefs.get(node.init.name);
            if (ref && !primitiveRefs.has(node.id.name)) {
              primitiveRefs.set(node.id.name, ref);
              changed = true;
            }
          });
        }

        for (const node of calls) {
          if (!isInsideGeneratorFunction(node)) continue;
          const trigger = getTrigger(node);
          if (!trigger || isYieldStarConsumed(node)) continue;

          context.report({
            node,
            messageId: 'requireYield',
            data: trigger,
          });
        }
      },
    };

    function getTrigger(node) {
      if (node.callee.type !== 'MemberExpression') return null;
      if (node.callee.object.type !== 'Identifier') return null;

      const ref = primitiveRefs.get(node.callee.object.name);
      if (!ref) return null;

      const method = node.callee.computed
        ? node.callee.property.type === 'Literal'
          ? String(node.callee.property.value)
          : undefined
        : node.callee.property.name;
      if (!method || !ref.methods.has(method)) return null;

      return { primitive: ref.primitive, method };
    }

    function findPrimitiveCreation(node) {
      let current = node;
      while (current) {
        if (current.type === 'YieldExpression') {
          current = current.argument;
          continue;
        }
        if (
          current.type === 'TSAsExpression' ||
          current.type === 'TSTypeAssertion' ||
          current.type === 'ChainExpression'
        ) {
          current = current.expression;
          continue;
        }
        if (current.type !== 'CallExpression') return undefined;

        if (
          current.callee.type === 'Identifier' &&
          (current.callee.name === 'craftUse' ||
            imported.get(current.callee.name) === 'craftUse')
        ) {
          current = current.arguments[0];
          continue;
        }

        if (
          current.callee.type === 'Identifier' &&
          primitiveNames.has(current.callee.name)
        ) {
          return primitiveNames.get(current.callee.name);
        }
        return undefined;
      }
      return undefined;
    }
  },
};

function isInsideGeneratorFunction(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'ArrowFunctionExpression') return false;
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return current.generator === true;
    }
    current = current.parent;
  }
  return false;
}

function isYieldStarConsumed(node) {
  let parent = node.parent;
  while (parent && parent.type === 'ParenthesizedExpression') {
    parent = parent.parent;
  }
  return parent?.type === 'YieldExpression' && parent.delegate === true;
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
