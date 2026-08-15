module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer passing a yieldable callback directly when a template generator only delegates to it.',
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
          node,
          messageId: 'preferDirect',
          fix(fixer) {
            const delegatedCall = node.body.body[0].argument.argument;
            return fixer.replaceText(
              node,
              sourceCode.getText(delegatedCall.callee),
            );
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

      const statement = node.body.body[0];
      const delegatedCall = statement.argument?.argument;

      return Boolean(
        statement.type === 'ReturnStatement' &&
          statement.argument?.type === 'YieldExpression' &&
          statement.argument.delegate &&
          delegatedCall?.type === 'CallExpression' &&
          delegatedCall.arguments.length === 0 &&
          delegatedCall.callee.type === 'Identifier',
      );
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
