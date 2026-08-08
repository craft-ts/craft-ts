module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow async functions and await expressions in Craft code; use generators and yield-based Craft utilities instead.',
    },
    schema: [],
    messages: {
      async:
        'Async functions are forbidden in Craft code. Use a generator function and yield* Craft utilities such as craftSleep, query, mutation, asyncProcess, or CraftHttpClient.',
      await:
        'await is forbidden in Craft code. Use yield* with a Craft generator or primitive instead.',
      forAwait:
        'for await...of is forbidden in Craft code. Use a yield-based Craft flow instead.',
    },
  },

  create(context) {
    return {
      FunctionDeclaration(node) {
        reportAsync(node);
      },
      FunctionExpression(node) {
        reportAsync(node);
      },
      ArrowFunctionExpression(node) {
        reportAsync(node);
      },
      AwaitExpression(node) {
        context.report({ node, messageId: 'await' });
      },
      ForOfStatement(node) {
        if (node.await) {
          context.report({ node, messageId: 'forAwait' });
        }
      },
    };

    function reportAsync(node) {
      if (node.async) {
        context.report({ node, messageId: 'async' });
      }
    }
  },
};
