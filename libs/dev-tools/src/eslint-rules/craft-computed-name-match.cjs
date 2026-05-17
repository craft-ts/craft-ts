module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Ensure craftComputed(name, ...) is called with a string literal first argument that matches the declared variable or class property name.",
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingName:
        "craftComputed must be called with a string literal name matching '{{declaredName}}' as the first argument.",
      mismatchedName:
        "craftComputed first argument '{{actual}}' must match the declared name '{{declaredName}}'.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComputed'
        ) {
          return;
        }

        const declaredName = getDeclaredName(node);
        if (!declaredName) {
          return;
        }

        const firstArg = node.arguments[0];

        if (!firstArg) {
          context.report({
            node,
            messageId: 'missingName',
            data: { declaredName },
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

        if (isStringLiteral(firstArg)) {
          const actual = getStringLiteralValue(firstArg);
          if (actual === declaredName) {
            return;
          }
          context.report({
            node: firstArg,
            messageId: 'mismatchedName',
            data: { declaredName, actual },
            fix(fixer) {
              return fixer.replaceText(firstArg, `'${declaredName}'`);
            },
          });
          return;
        }

        context.report({
          node: firstArg,
          messageId: 'missingName',
          data: { declaredName },
          fix(fixer) {
            return fixer.insertTextBefore(firstArg, `'${declaredName}', `);
          },
        });
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
