const WRITE_METHODS = new Set(['set', 'update', 'mutate']);
const DOM_EVENTS = new Set([
  'change',
  'click',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'submit',
]);

function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow signal writes from Craft component templates and render bindings.',
    },
    schema: [],
    messages: {
      renderWrite:
        'Do not call {{method}}() while rendering a Craft template. Move the write to a DOM event, output, mutation, or explicit business effect.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4 ||
          !isFunctionNode(node.arguments[3])
        ) {
          return;
        }
        inspect(node.arguments[3].body);
      },
    };

    function inspect(root) {
      walk(root, (node) => {
        if (isNestedCraftComponent(node)) return 'skip';
        if (node.type === 'Property' && isAllowedCallbackProperty(node)) {
          return 'skip';
        }
        if (
          node.type !== 'CallExpression' ||
          node.callee.type !== 'MemberExpression' ||
          node.callee.computed ||
          node.callee.property.type !== 'Identifier' ||
          !WRITE_METHODS.has(node.callee.property.name)
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'renderWrite',
          data: { method: node.callee.property.name },
        });
      });
    }

    function isAllowedCallbackProperty(node) {
      if (node.computed || !isFunctionNode(node.value)) return false;
      const name =
        node.key.type === 'Identifier'
          ? node.key.name
          : node.key.type === 'Literal' && typeof node.key.value === 'string'
            ? node.key.value
            : undefined;
      return Boolean(name && (DOM_EVENTS.has(name) || /^on[A-Z]/.test(name)));
    }

    function isNestedCraftComponent(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'craftComponent'
      );
    }

    function walk(node, visitor) {
      if (!node || typeof node.type !== 'string') return;
      if (visitor(node) === 'skip') return;
      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((entry) => walk(entry, visitor));
        } else {
          walk(child, visitor);
        }
      }
    }
  },
};
