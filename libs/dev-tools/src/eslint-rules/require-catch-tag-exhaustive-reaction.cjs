module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require catchTag.exhaustive handlers to react instead of silently returning.',
    },
    schema: [],
    messages: {
      silent:
        'This catchTag.exhaustive handler does not react to the exception. Handle it with a meaningful side effect, or leave it for catchNode.exhaustive / matchNode.exhaustive to display.',
      bareReturn:
        'Do not use a bare return in a catchTag.exhaustive handler. Perform the intended handling and let the generator finish naturally.',
    },
  },

  create(context) {
    const catchTagNames = new Set(['catchTag']);

    return {
      ImportDeclaration(node) {
        if (
          node.source.value !== '@craft-ts/component' &&
          node.source.value !== '@craft-ts/core'
        ) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'catchTag'
          ) {
            catchTagNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (!isCatchTagExhaustiveCall(node, catchTagNames)) return;
        const handlers = node.arguments[0];
        if (!handlers || handlers.type !== 'ObjectExpression') return;

        for (const property of handlers.properties) {
          if (property.type !== 'Property' || property.computed) continue;
          const handler = property.value;
          if (
            handler.type !== 'FunctionExpression' &&
            handler.type !== 'ArrowFunctionExpression'
          ) {
            continue;
          }

          if (handler.body.type !== 'BlockStatement') {
            if (isUndefinedExpression(handler.body)) {
              context.report({ node: handler, messageId: 'silent' });
            }
            continue;
          }

          const bodyStatements = handler.body.body.filter(
            (statement) => statement.type !== 'EmptyStatement',
          );
          if (bodyStatements.length === 0) {
            context.report({ node: handler, messageId: 'silent' });
            continue;
          }

          walk(handler.body, (child) => {
            if (
              child.type === 'ReturnStatement' &&
              child.argument === null &&
              isWithinHandler(child, handler)
            ) {
              context.report({ node: child, messageId: 'bareReturn' });
            }
          });
        }
      },
    };
  },
};

function isCatchTagExhaustiveCall(node, names) {
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'exhaustive' &&
    callee.object.type === 'Identifier' &&
    names.has(callee.object.name)
  );
}

function isWithinHandler(node, handler) {
  let current = node.parent;
  while (current && current !== handler) {
    if (
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration'
    ) {
      return false;
    }
    current = current.parent;
  }
  return current === handler;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function isUndefinedExpression(node) {
  return (
    (node.type === 'Identifier' && node.name === 'undefined') ||
    (node.type === 'UnaryExpression' &&
      node.operator === 'void' &&
      node.argument.type === 'Literal' &&
      node.argument.value === 0)
  );
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
