module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow async/await where native Promise suspension would hide Craft dependencies, cancellation, or exception tracking; use generators and yield-based Craft utilities instead.',
    },
    schema: [],
    messages: {
      async:
        'Async functions are forbidden in Craft code because their native Promise is opaque to Craft: dependencies and suspension cannot be recorded or tied to resource cancellation. Use function* and yield* Craft utilities such as craftSleep, query, mutation, asyncProcess, or CraftHttpClient.',
      await:
        'await is forbidden in Craft code because it hides the suspension from the Craft driver and can lose dependency, cancellation, and exception tracking. Use yield* with a Craft generator or primitive instead.',
      forAwait:
        'for await...of is forbidden in Craft code because it hides asynchronous iteration from the Craft driver. Use a yield-based Craft flow so each suspension remains tracked.',
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
