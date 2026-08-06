const TEMPLATE_CONTROL_FLOW = new Set([
  'IfStatement',
  'SwitchStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'TryStatement',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep Craft component templates declarative by using typed Craft blocks instead of inline logic.',
    },
    schema: [],
    messages: {
      ternary:
        'Do not use a ternary in a Craft template. Use ifBlock(...) for boolean visibility or matchBlock.exhaustive(...) for a discriminated union.',
      logical:
        'Do not use a logical expression in a Craft template. Move the derivation to state, query, or craftComputed, then render it with a Craft block.',
      controlFlow:
        'Do not use imperative control flow in a Craft template. Use ifBlock(...), matchBlock.exhaustive(...), each(...), or defer(...) so the render contract stays type-checkable.',
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

        if (node.type === 'ConditionalExpression') {
          context.report({ node, messageId: 'ternary' });
          return;
        }

        if (node.type === 'LogicalExpression') {
          context.report({ node, messageId: 'logical' });
          return;
        }

        if (TEMPLATE_CONTROL_FLOW.has(node.type)) {
          context.report({ node, messageId: 'controlFlow' });
        }
      });
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') {
        return;
      }

      if (visit(node) === 'skip') {
        return;
      }

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            walk(item, visit);
          }
        } else {
          walk(child, visit);
        }
      }
    }
  },
};

function isNestedCraftComponent(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'craftComponent'
  );
}
