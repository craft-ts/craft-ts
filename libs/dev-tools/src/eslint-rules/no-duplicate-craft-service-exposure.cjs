const {
  isServiceExposure,
  primitiveName,
  serviceFactoryOf,
} = require('./craft-service-exposure-utils.cjs');

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require each public key exposed by a craftService to be unique.',
      url: 'https://craft-ts.github.io/craft/guide/routing/eslint-rules#keep-craft-service-exposure-keys-unique',
    },
    schema: [],
    messages: {
      duplicate:
        'The craftService key "{{name}}" is already exposed at line {{firstLine}}. Every exposed key must be unique; remove one exposure or choose a distinct key for a standalone value.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const visitorKeys = sourceCode.visitorKeys;

    return {
      CallExpression(node) {
        const factory = serviceFactoryOf(node);
        if (!factory || !isFunction(factory) || !factory.body) return;

        const firstExposureByName = new Map();
        const visit = (current) => {
          if (!current || typeof current.type !== 'string') return;
          if (current !== factory && isFunction(current)) return;

          if (current.type === 'CallExpression' && isServiceExposure(current)) {
            const name = primitiveName(current);
            if (name !== undefined) {
              const first = firstExposureByName.get(name);
              if (first) {
                context.report({
                  node: current,
                  messageId: 'duplicate',
                  data: { name, firstLine: first.loc.start.line },
                });
              } else {
                firstExposureByName.set(name, current);
              }
            }
          }

          for (const key of visitorKeys[current.type] ?? []) {
            const child = current[key];
            if (Array.isArray(child)) child.forEach(visit);
            else visit(child);
          }
        };

        // Nested functions have their own execution and exposure context.
        // `visit` skips them while still checking every direct service-body
        // statement, including statements inside blocks and conditionals.
        visit(factory.body);
      },
    };
  },
};
