module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular inject(), @Injectable, and @Service usage so dependencies go through craftService or toCraftService.',
    },
    schema: [],
  },
  create(context) {
    const angularNamespaceImports = new Set();
    const angularInjectableImports = new Set();
    const angularServiceImports = new Set();

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

          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'Injectable'
          ) {
            angularInjectableImports.add(specifier.local.name);
            continue;
          }

          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'Service'
          ) {
            angularServiceImports.add(specifier.local.name);
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
      Decorator(node) {
        const decoratorName = getAngularBlockedDecoratorName(
          node.expression,
          angularInjectableImports,
          angularServiceImports,
          angularNamespaceImports,
        );
        if (!decoratorName) {
          return;
        }

        context.report({
          node,
          message: `Angular @${decoratorName} is forbidden. Expose the dependency through craftService or toCraftService instead.`,
        });
      },
    };
  },
};

function isAngularModule(sourceValue) {
  return typeof sourceValue === 'string' && sourceValue.startsWith('@angular/');
}

function getAngularBlockedDecoratorName(
  expression,
  angularInjectableImports,
  angularServiceImports,
  angularNamespaceImports,
) {
  if (expression.type === 'Identifier') {
    if (angularInjectableImports.has(expression.name)) {
      return 'Injectable';
    }

    if (angularServiceImports.has(expression.name)) {
      return 'Service';
    }

    return undefined;
  }

  if (expression.type === 'CallExpression') {
    return getAngularBlockedDecoratorName(
      expression.callee,
      angularInjectableImports,
      angularServiceImports,
      angularNamespaceImports,
    );
  }

  if (
    expression.type === 'MemberExpression' &&
    !expression.computed &&
    expression.object.type === 'Identifier' &&
    angularNamespaceImports.has(expression.object.name) &&
    expression.property.type === 'Identifier' &&
    (expression.property.name === 'Injectable' || expression.property.name === 'Service')
  ) {
    return expression.property.name;
  }

  return undefined;
}
