module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer passing a yieldable callback directly when a template generator or method only delegates to it.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferDirect:
        'Pass the yieldable callback directly instead of wrapping it in a generator.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4
        ) {
          return;
        }

        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      walk(template, (node) => {
        if (node !== template && isNestedCraftComponent(node)) {
          return 'skip';
        }

        if (!isRedundantGenerator(node)) {
          return;
        }

        context.report({
          node: getReportNode(node),
          messageId: 'preferDirect',
          fix(fixer) {
            const delegatedCall = getDelegatedCall(node);
            const directCallback = sourceCode.getText(delegatedCall.callee);

            if (isMethodProperty(node)) {
              return fixer.replaceText(
                node.parent,
                `${sourceCode.getText(node.parent.key)}: ${directCallback}`,
              );
            }

            return fixer.replaceText(node, directCallback);
          },
        });
      });
    }

    function isRedundantGenerator(node) {
      if (
        node.type !== 'FunctionExpression' ||
        node.id ||
        !node.generator ||
        node.params.length > 0 ||
        node.body.type !== 'BlockStatement' ||
        node.body.body.length !== 1
      ) {
        return false;
      }

      const delegatedCall = getDelegatedCall(node);

      return Boolean(
        delegatedCall?.type === 'CallExpression' &&
          delegatedCall.arguments.length === 0 &&
          isDirectCallbackCallee(delegatedCall.callee),
      );
    }

    function isDirectCallbackCallee(callee) {
      if (callee.type === 'Identifier') {
        return true;
      }

      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        !callee.optional &&
        callee.property.type === 'Identifier' &&
        isDirectCallbackCallee(callee.object)
      );
    }

    function getDelegatedCall(node) {
      const statement = node.body.body[0];
      const yieldExpression =
        statement.type === 'ReturnStatement'
          ? statement.argument
          : statement.type === 'ExpressionStatement'
            ? statement.expression
            : undefined;

      return yieldExpression?.type === 'YieldExpression' &&
        yieldExpression.delegate
        ? yieldExpression.argument
        : undefined;
    }

    function isMethodProperty(node) {
      return (
        node.parent?.type === 'Property' &&
        node.parent.value === node &&
        node.parent.method
      );
    }

    function getReportNode(node) {
      return isMethodProperty(node) ? node.parent : node;
    }

    function isNestedCraftComponent(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'craftComponent'
      );
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((item) => walk(item, visit));
        } else {
          walk(child, visit);
        }
      }
    }
  },
};
