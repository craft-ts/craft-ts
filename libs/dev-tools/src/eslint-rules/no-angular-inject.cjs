module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular inject() usage so dependencies go through craftService or toCraftService.',
    },
    schema: [],
  },
  create(context) {
    const angularNamespaceImports = new Set();

    return {
      ImportDeclaration(node) {
        if (!isAngularModule(node.source.value)) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'inject'
          ) {
            context.report({
              node: specifier,
              message:
                'Angular inject() is forbidden. Expose a craftService/toCraftService injector instead.',
            });
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            angularNamespaceImports.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.object.type !== 'Identifier' ||
          !angularNamespaceImports.has(callee.object.name) ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'inject'
        ) {
          return;
        }

        context.report({
          node: callee.property,
          message:
            'Angular inject() is forbidden. Expose a craftService/toCraftService injector instead.',
        });
      },
    };
  },
};

function isAngularModule(sourceValue) {
  return typeof sourceValue === 'string' && sourceValue.startsWith('@angular/');
}
