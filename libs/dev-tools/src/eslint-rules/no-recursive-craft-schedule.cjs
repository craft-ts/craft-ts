'use strict';

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
]);

function isFunction(node) {
  return node && FUNCTION_TYPES.has(node.type);
}

function staticMemberName(node) {
  if (node.type !== 'MemberExpression') return undefined;
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  return undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a scheduled callback from scheduling itself as an imperative recurring loop.',
    },
    schema: [],
    messages: {
      recursiveSchedule:
        'This callback schedules itself recursively, creating an imperative recurring loop. Declare the cadence with `timer(...)` from `@craft-ts/stream` and pass that stream as the resource `method`. No automatic fix is available because the cadence and emitted params depend on the use case.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function resolveVariable(identifier) {
      let scope = sourceCode.getScope
        ? sourceCode.getScope(identifier)
        : context.getScope();

      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) return variable;
        scope = scope.upper;
      }

      return undefined;
    }

    function functionForVariable(variable, seen = new Set()) {
      if (!variable || seen.has(variable)) return undefined;
      seen.add(variable);

      for (const definition of variable.defs) {
        if (definition.node.type === 'FunctionDeclaration') {
          return definition.node;
        }

        if (definition.node.type !== 'VariableDeclarator') continue;
        const initializer = definition.node.init;
        if (isFunction(initializer)) return initializer;
        if (initializer?.type === 'Identifier') {
          return functionForVariable(resolveVariable(initializer), seen);
        }
      }

      return undefined;
    }

    function enclosingFunction(node) {
      let current = node.parent;
      while (current && !isFunction(current)) current = current.parent;
      return current;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          staticMemberName(node.callee) !== 'schedule'
        ) {
          return;
        }

        const callback = node.arguments[0];
        if (callback?.type !== 'Identifier') return;

        const scheduledFunction = functionForVariable(
          resolveVariable(callback),
        );
        if (!scheduledFunction) return;

        // Only report when this exact function is the scheduled callback.
        // Calls inside nested functions are left alone: they may never run.
        if (enclosingFunction(node) !== scheduledFunction) return;

        context.report({ node, messageId: 'recursiveSchedule' });
      },
    };
  },
};
