const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

const namedRule = createNameMatchRule({
  calleeName: 'craftComputed',
  description:
    'Require a matching craftComputed name outside insertion result objects; insertion keys provide the runtime name automatically.',
  supportsObjectConfigForm: false,
});

module.exports = {
  ...namedRule,
  create(context) {
    const listeners = namedRule.create(context);
    return {
      ...listeners,
      CallExpression(node) {
        if (isInsertionResultProperty(node)) return;
        listeners.CallExpression?.(node);
      },
    };
  },
};

function isInsertionResultProperty(node) {
  const property = node.parent;
  if (
    property?.type !== 'Property' ||
    property.value !== node ||
    property.parent?.type !== 'ObjectExpression'
  ) {
    return false;
  }

  let current = property.parent;
  while (current) {
    if (
      (current.type === 'ArrowFunctionExpression' ||
        current.type === 'FunctionExpression') &&
      current.parent?.type === 'CallExpression'
    ) {
      const callee = current.parent.callee;
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression' &&
              !callee.computed &&
              callee.property.type === 'Identifier'
            ? callee.property.name
            : undefined;
      return Boolean(
        name &&
          (name.startsWith('insert') ||
            name === 'craftPipe' ||
            ['state', 'query', 'mutation', 'asyncProcess', 'queryParams'].includes(
              name,
            )),
      );
    }
    if (current.type === 'Program') break;
    current = current.parent;
  }
  return false;
}
