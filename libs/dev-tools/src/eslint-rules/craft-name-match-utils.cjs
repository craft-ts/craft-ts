const { isServiceExposure } = require('./craft-service-exposure-utils.cjs');

function createNameMatchRule({
  calleeName,
  description,
  supportsObjectConfigForm = false,
  requireImport = false,
  // `state('')`: a lone argument is the initial value, not a name (the
  // runtime tells them apart the same way).
  unnamedWhenSingleArgument = false,
}) {
  return {
    meta: {
      type: 'problem',
      docs: { description },
      fixable: 'code',
      schema: [],
      messages: {
        missingName:
          "{{calleeName}} must be called with a string literal name matching '{{declaredName}}' as the first argument.",
        mismatchedName:
          "{{calleeName}} first argument '{{actual}}' must match the declared name '{{declaredName}}'.",
      },
    },
    create(originalContext) {
      const sourceCode =
        originalContext.sourceCode ?? originalContext.getSourceCode();
      let exposure = false;
      // Renaming an exposed primitive renames the service's public key and
      // breaks its consumers: report it, but never fix it automatically.
      const context = {
        report(descriptor) {
          originalContext.report(
            exposure ? { ...descriptor, fix: undefined } : descriptor,
          );
        },
      };

      return {
        CallExpression(node) {
          if (
            node.callee.type !== 'Identifier' ||
            node.callee.name !== calleeName
          ) {
            return;
          }
          if (requireImport && !isImported(node.callee, sourceCode)) {
            return;
          }
          exposure = isServiceExposure(node);

          const declaredName = getDeclaredName(node);
          if (!declaredName) {
            return;
          }

          const firstArg = node.arguments[0];

          if (
            unnamedWhenSingleArgument &&
            node.arguments.length === 1 &&
            firstArg.type !== 'SpreadElement'
          ) {
            context.report({
              node: firstArg,
              messageId: 'missingName',
              data: { calleeName, declaredName },
              fix(fixer) {
                return fixer.insertTextBefore(firstArg, `'${declaredName}', `);
              },
            });
            return;
          }

          if (!firstArg) {
            context.report({
              node,
              messageId: 'missingName',
              data: { calleeName, declaredName },
              fix(fixer) {
                const openParen = sourceCode.getTokenAfter(
                  node.callee,
                  (token) => token.type === 'Punctuator' && token.value === '(',
                );
                if (!openParen) return null;
                return fixer.insertTextAfter(openParen, `'${declaredName}'`);
              },
            });
            return;
          }

          if (
            supportsObjectConfigForm &&
            firstArg.type === 'ObjectExpression'
          ) {
            const nameProp = firstArg.properties.find(
              (p) =>
                p.type === 'Property' &&
                !p.computed &&
                p.key.type === 'Identifier' &&
                p.key.name === 'name',
            );
            if (!nameProp) {
              context.report({
                node: firstArg,
                messageId: 'missingName',
                data: { calleeName, declaredName },
              });
              return;
            }
            const nameValue = nameProp.value;
            if (isStringLiteral(nameValue)) {
              const actual = getStringLiteralValue(nameValue);
              if (actual === declaredName) {
                return;
              }
              context.report({
                node: nameValue,
                messageId: 'mismatchedName',
                data: { calleeName, declaredName, actual },
                fix(fixer) {
                  return fixer.replaceText(nameValue, `'${declaredName}'`);
                },
              });
            } else {
              context.report({
                node: nameValue,
                messageId: 'mismatchedName',
                data: {
                  calleeName,
                  declaredName,
                  actual: sourceCode.getText(nameValue),
                },
              });
            }
            return;
          }

          if (isStringLiteral(firstArg)) {
            const actual = getStringLiteralValue(firstArg);
            if (actual === declaredName) {
              return;
            }
            context.report({
              node: firstArg,
              messageId: 'mismatchedName',
              data: { calleeName, declaredName, actual },
              fix(fixer) {
                return fixer.replaceText(firstArg, `'${declaredName}'`);
              },
            });
            return;
          }

          context.report({
            node: firstArg,
            messageId: 'missingName',
            data: { calleeName, declaredName },
            fix(fixer) {
              return fixer.insertTextBefore(firstArg, `'${declaredName}', `);
            },
          });
        },
      };
    },
  };
}

/**
 * The name a primitive call is bound to — looking through the ways a primitive
 * generator is consumed: `yield* x(...)`, `craftUse(x(...))`,
 * `craftPrivate(x(...))` (and their combinations).
 */
function getDeclaredName(callNode) {
  let node = callNode;
  let parent = node.parent;
  while (
    parent &&
    ((parent.type === 'YieldExpression' && parent.delegate) ||
      parent.type === 'TSAsExpression' ||
      parent.type === 'ParenthesizedExpression' ||
      (parent.type === 'CallExpression' &&
        parent.callee.type === 'Identifier' &&
        (parent.callee.name === 'craftUse' ||
          parent.callee.name === 'craftPrivate') &&
        parent.arguments[0] === node))
  ) {
    node = parent;
    parent = node.parent;
  }
  return getBindingName(node, parent);
}

function getBindingName(callNode, parent) {
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

  if (
    parent.type === 'Property' &&
    parent.value === callNode &&
    !parent.computed &&
    parent.key.type === 'Identifier' &&
    parent.parent &&
    parent.parent.type === 'ObjectExpression'
  ) {
    return parent.key.name;
  }

  return undefined;
}

/** `true` when `identifier` resolves to an import binding. */
function isImported(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.variables.find(
      (candidate) => candidate.name === identifier.name,
    );
    if (variable) {
      return (
        variable.defs.length > 0 &&
        variable.defs.every((def) => def.type === 'ImportBinding')
      );
    }
    scope = scope.upper;
  }
  return false;
}

function isStringLiteral(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return true;
  }
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return true;
  }
  return false;
}

function getStringLiteralValue(node) {
  if (node.type === 'Literal') {
    return node.value;
  }
  return node.quasis[0].value.cooked;
}

module.exports = { createNameMatchRule };
