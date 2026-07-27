const HTML_HELPERS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'div',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'header',
  'img',
  'input',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'textarea',
  'ul',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require unique literal tag/local-name pairs in each Craft component template.',
    },
    schema: [],
    messages: {
      duplicate:
        'The template element name "{{key}}" is declared more than once in this component.',
      literal:
        'Craft template element names must be string literals that can be resolved statically.',
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

        const template = node.arguments[3];
        const seen = new Map();

        walk(template, (candidate) => {
          if (
            candidate !== template &&
            candidate.type === 'CallExpression' &&
            candidate.callee.type === 'Identifier' &&
            candidate.callee.name === 'craftComponent'
          ) {
            return 'skip';
          }

          if (
            candidate.type !== 'CallExpression' ||
            candidate.callee.type !== 'Identifier' ||
            !HTML_HELPERS.has(candidate.callee.name) ||
            candidate.arguments.length < 2
          ) {
            return;
          }

          const name = candidate.arguments[0];
          const props = candidate.arguments[1];
          if (
            name.type === 'ObjectExpression' ||
            name.type === 'ArrayExpression' ||
            isNullLiteral(name)
          ) {
            return;
          }

          if (!isStringLiteral(name)) {
            context.report({ node: name, messageId: 'literal' });
            return;
          }

          // A second argument is the props position in the named helper form.
          // Keep the check deliberately structural so branches and each bodies
          // are inspected without evaluating user code.
          if (props.type === 'ObjectExpression' || isNullLiteral(props)) {
            const key = `${candidate.callee.name}:${stringLiteralValue(name)}`;
            if (seen.has(key)) {
              context.report({
                node: name,
                messageId: 'duplicate',
                data: { key },
              });
            } else {
              seen.set(key, name);
            }
          }
        });
      },
    };

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      const result = visit(node);
      if (result === 'skip') return;

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

function isStringLiteral(node) {
  return (
    (node.type === 'Literal' && typeof node.value === 'string') ||
    (node.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis.length === 1)
  );
}

function isNullLiteral(node) {
  return (
    node.type === 'NullLiteral' ||
    (node.type === 'Literal' && node.value === null)
  );
}

function stringLiteralValue(node) {
  return node.type === 'Literal' ? node.value : node.quasis[0].value.cooked;
}
