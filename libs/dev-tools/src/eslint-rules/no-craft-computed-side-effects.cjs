const {
  COMPUTED_READ_MESSAGES,
  createComputedReadSafety,
} = require('./computed-read-safety.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow writes, asynchronous work and unproven service resolution inside craftComputed callbacks; only reactive reads, settled(...) and syncEffect(...) are allowed.',
    },
    schema: [],
    messages: {
      ...COMPUTED_READ_MESSAGES,
      missingTypeInfo:
        'This rule requires TypeScript type information to identify reactive reads and asynchronous Craft calls.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const safety = createComputedReadSafety(context);

    return {
      ImportDeclaration(node) {
        safety.trackImport(node);
      },

      Program() {
        if (!safety.hasTypeInfo) {
          context.report({
            node: sourceCode.ast,
            messageId: 'missingTypeInfo',
          });
        }
      },

      CallExpression(node) {
        if (!safety.hasTypeInfo || !safety.isCraftComputedCall(node)) return;

        const computation = getComputation(node);
        if (!computation) return;

        walk(computation.body ?? computation, (child) => {
          if (child.type === 'AwaitExpression') {
            context.report({
              node: child,
              messageId: 'forbidden',
              data: { call: 'await' },
            });
            return;
          }

          if (child.type !== 'CallExpression') return;
          const problem = safety.check(child);
          if (problem) context.report({ node: child, ...problem });
        });
      },
    };

    function getComputation(node) {
      return node.arguments.filter(isFunctionNode).at(-1);
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      visit(node);

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

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration'
      );
    }
  },
};
