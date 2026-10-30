const CORE_PACKAGES = new Set(['@craft-ts/core', '@craft-ts/effect']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require client-exposed server functions to declare schemas for decoding input and encoding output.',
    },
    schema: [],
    messages: {
      input:
        'Client-exposed server functions need an input schema to decode and validate transport input. Add the input schema, or document a limited opaque-protocol exemption with codecExemption.',
      output:
        'Client-exposed server functions need an output schema to validate and encode their result. Add options.output, or document a limited opaque-protocol exemption with codecExemption.',
      exemption:
        'codecExemption must explain why this boundary is opaque and how it is handled; keep the reason specific to this call.',
    },
  },

  create(context) {
    if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(context.filename ?? '')) return {};
    const serverFunctionBindings = new Set();
    const serverFunctionNamespaces = new Set();
    const contractBindings = new Set();

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value ?? '');
        if (!CORE_PACKAGES.has(source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const imported = specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;
            if (imported === 'serverFunction' || imported === 'portableServerFunction')
              serverFunctionBindings.add(specifier.local.name);
            if (imported === 'serverFunctionContract')
              contractBindings.add(specifier.local.name);
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            serverFunctionNamespaces.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (isServerFunctionCall(node)) {
          const options = node.arguments[2];
          const exposure = propertyValue(options, 'exposure');
          if (exposure !== 'client') return;
          const exemption = propertyValue(options, 'codecExemption');
          if (typeof exemption === 'string') {
            if (exemption.trim().length < 12)
              context.report({ node: options, messageId: 'exemption' });
            return;
          }
          if (
            node.arguments[1] === undefined ||
            (node.arguments[1].type === 'Identifier' &&
              node.arguments[1].name === 'undefined')
          )
            context.report({ node: node.callee, messageId: 'input' });
          if (propertyValue(options, 'output') === undefined)
            context.report({ node: options ?? node.callee, messageId: 'output' });
          return;
        }

        if (!isContractCall(node)) return;
        const options = node.arguments[0];
        if (propertyValue(options, 'exposure') !== 'client') return;
        const exemption = propertyValue(options, 'codecExemption');
        if (typeof exemption === 'string') {
          if (exemption.trim().length < 12)
            context.report({ node: options, messageId: 'exemption' });
          return;
        }
        if (propertyValue(options, 'input') === undefined)
          context.report({ node: options ?? node.callee, messageId: 'input' });
        if (propertyValue(options, 'output') === undefined)
          context.report({ node: options ?? node.callee, messageId: 'output' });
      },
    };

    function isServerFunctionCall(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier')
        return serverFunctionBindings.has(callee.name);
      return callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        serverFunctionNamespaces.has(callee.object.name) &&
        ['serverFunction', 'portableServerFunction'].includes(callee.property.name);
    }

    function isContractCall(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier') return contractBindings.has(callee.name);
      return callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        serverFunctionNamespaces.has(callee.object.name) &&
        callee.property.name === 'serverFunctionContract';
    }
  },
};

function propertyValue(node, name) {
  if (!node || node.type !== 'ObjectExpression') return undefined;
  const property = node.properties.find((item) => {
    if (item.type !== 'Property' || item.computed) return false;
    return item.key.type === 'Identifier' || item.key.type === 'Literal'
      ? item.key.name === name || item.key.value === name
      : false;
  });
  if (!property) return undefined;
  const value = property.value;
  if (value.type === 'Literal') return value.value;
  if (value.type === 'Identifier' && value.name === 'undefined') return undefined;
  return value;
}
