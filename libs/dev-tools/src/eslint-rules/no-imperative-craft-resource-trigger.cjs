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
        'Disallow imperative query, mutation, and asyncProcess triggers from craftEffect dependency graphs.',
    },
    schema: [],
    messages: {
      forbidden:
        'Imperative {{primitive}}.{{method}}(...) is forbidden from a craftEffect dependency graph. Trigger the resource from a declarative source or outside the effect.',
      indirectForbidden:
        'This craftEffect depends on a craftGen that imperatively calls {{primitive}}.{{method}}(...). Trigger the resource from a declarative source or outside the effect.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const imported = new Map();
    const effectNames = new Set(['craftEffect']);
    const craftGenNames = new Set(['craftGen']);
    const primitiveNames = new Map();
    const primitiveRefs = new Map();
    const craftGenFactories = new Map();
    const effectCallbacks = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const importedName = specifier.imported.name;
          const localName = specifier.local.name;
          imported.set(localName, importedName);
          if (importedName === 'craftEffect') effectNames.add(localName);
          if (importedName === 'craftGen') craftGenNames.add(localName);
          if (PRIMITIVE_METHODS[importedName]) {
            primitiveNames.set(localName, importedName);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !effectNames.has(node.callee.name)
        ) {
          return;
        }

        const callback = [...node.arguments]
          .reverse()
          .find(isFunction);
        if (callback) effectCallbacks.push(callback);
      },

      VariableDeclarator(node) {
        if (node.id.type === 'Identifier') {
          const primitive = findPrimitiveCreation(node.init);
          if (primitive) {
            primitiveRefs.set(node.id.name, {
              primitive,
              methods: PRIMITIVE_METHODS[primitive],
            });
          }
        }

        if (
          node.id.type === 'Identifier' &&
          node.init?.type === 'CallExpression' &&
          node.init.callee.type === 'Identifier' &&
          craftGenNames.has(node.init.callee.name) &&
          isFunction(node.init.arguments[0])
        ) {
          craftGenFactories.set(node.id.name, node.init.arguments[0]);
        }

        if (node.id.type === 'ObjectPattern') {
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

            const propertyName = getPropertyName(property.key);
            if (!propertyName) continue;
            primitiveRefs.set(property.value.name, {
              primitive,
              methods: PRIMITIVE_METHODS[primitive],
            });
          }
        }
      },

      'Program:exit'() {
        // Resolve simple aliases after all primitive destructuring declarations
        // have been collected. This covers `const q = users;` in an effect.
        let changed = true;
        while (changed) {
          changed = false;
          walkProgram(sourceCode.ast, (node) => {
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

        const reported = new Set();
        for (const callback of effectCallbacks) {
          scan(callback, reported);
        }

        function scan(root, reportedNodes) {
          walk(root, (node) => {
            if (node.type === 'CallExpression') {
              const trigger = getTrigger(node);
              if (trigger && !reportedNodes.has(node)) {
                reportedNodes.add(node);
                context.report({
                  node,
                  messageId: 'forbidden',
                  data: trigger,
                });
              }

              if (
                node.callee.type === 'Identifier' &&
                craftGenFactories.has(node.callee.name)
              ) {
                const factory = craftGenFactories.get(node.callee.name);
                const indirectTrigger = findForbiddenTrigger(factory);
                if (indirectTrigger && !reportedNodes.has(node)) {
                  reportedNodes.add(node);
                  context.report({
                    node,
                    messageId: 'indirectForbidden',
                    data: indirectTrigger,
                  });
                }
              }
            }
          });
        }

        function findForbiddenTrigger(root, seen = new Set()) {
          if (!root || seen.has(root)) return null;
          seen.add(root);

          let found = null;
          walk(root, (node) => {
            if (found) return;

            const trigger =
              node.type === 'CallExpression' ? getTrigger(node) : null;
            if (trigger) {
              found = trigger;
              return;
            }

            if (
              node.type === 'CallExpression' &&
              node.callee.type === 'Identifier' &&
              craftGenFactories.has(node.callee.name)
            ) {
              found = findForbiddenTrigger(
                craftGenFactories.get(node.callee.name),
                seen,
              );
            }
          });

          return found;
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

function isFunction(node) {
  return (
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  );
}

function getPropertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function walkProgram(root, visitor) {
  walk(root, visitor);
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
