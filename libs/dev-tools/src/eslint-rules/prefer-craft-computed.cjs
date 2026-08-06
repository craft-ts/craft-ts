const { isInsideCraftPrimitive } = require('./craft-primitive-context.cjs');

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer craftComputed() over computed() from @angular/core for better observability and host name tracking.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      preferCraftComputed:
        "Use craftComputed('{{name}}', ...) instead of computed() for better observability. craftComputed adds HostName tracking to the computed signal.",
      preferCraftComputedUnnamed:
        "Use craftComputed('name', ...) instead of computed() for better observability. craftComputed adds HostName tracking to the computed signal.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'computed'
        ) {
          return;
        }

        if (!isAngularComputedImport(node, context)) {
          return;
        }

        if (isInsideCraftPrimitive(node)) {
          return;
        }

        const declaredName = getDeclaredName(node);

        if (declaredName) {
          context.report({
            node,
            messageId: 'preferCraftComputed',
            data: { name: declaredName },
            suggest: [
              {
                desc: `Replace with craftComputed('${declaredName}', ...)`,
                fix(fixer) {
                  return fixer.replaceText(node.callee, 'craftComputed');
                },
              },
            ],
          });
        } else {
          context.report({
            node,
            messageId: 'preferCraftComputedUnnamed',
          });
        }
      },
    };
  },
};

function getDeclaredName(callNode) {
  const parent = callNode.parent;
  if (!parent) return undefined;

  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === callNode &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id.name;
  }

  if (
    parent.type === 'PropertyDefinition' &&
    parent.value === callNode &&
    !parent.computed &&
    parent.key.type === 'Identifier'
  ) {
    return parent.key.name;
  }

  return undefined;
}

function isAngularComputedImport(callNode, context) {
  const scope = context.getScope
    ? context.getScope()
    : context.sourceCode.getScope(callNode);

  let currentScope = scope;
  while (currentScope) {
    for (const variable of currentScope.variables) {
      if (variable.name === 'computed') {
        for (const def of variable.defs) {
          if (
            def.type === 'ImportBinding' &&
            def.parent &&
            def.parent.source &&
            def.parent.source.value === '@angular/core'
          ) {
            return true;
          }
        }
      }
    }
    currentScope = currentScope.upper;
  }

  return false;
}
