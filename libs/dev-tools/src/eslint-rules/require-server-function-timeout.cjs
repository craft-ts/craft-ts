const { report, isCallNamed } = require('./security-rule-utils.cjs');

function propertyOf(node, name) {
  if (!node || node.type !== 'ObjectExpression') return undefined;
  return node.properties.find(
    (property) =>
      property.type === 'Property' &&
      (property.key.name ?? property.key.value) === name,
  );
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    docs: { description: 'Require body and timeout limits for server functions.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isCallNamed(node, 'createServer')) return;
        const options = node.arguments[0];
        if (!options || options.type !== 'ObjectExpression') return;
        // `createServer` de node:http prend un callback : ne rien dire.
        if (!propertyOf(options, 'functions')) return;
        const runtime = propertyOf(options, 'runtimeOptions');
        const value = runtime && runtime.value;
        const has = (name) => Boolean(propertyOf(value, name));
        if (!has('timeoutMs') || !has('maxBodyBytes')) {
          report(
            context,
            node,
            'createServer requires runtimeOptions.timeoutMs and runtimeOptions.maxBodyBytes.',
          );
        }
      },
    };
  },
};
