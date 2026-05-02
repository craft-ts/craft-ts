module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular @Injectable and @Service decorators in favor of craftService or toCraftService.',
    },
    hasSuggestions: true,
    schema: [],
  },
  create(context) {
    const angularNamespaceImports = new Set();
    const angularInjectableImports = new Set();
    const angularServiceImports = new Set();
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ImportDeclaration(node) {
        if (!isAngularModule(node.source.value)) {
          return;
        }

        for (const specifier of node.specifiers) {
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
          message: `Angular @${decoratorName} is forbidden. Author services with craftService(...) and adapt Angular dependencies with toCraftService(...) instead.`,
          suggest: [
            createTemporaryDisableSuggestion(
              sourceCode,
              node,
              'prefer-craft-service',
              'migrate this Angular service to craftService(...) or toCraftService(...)',
            ),
          ],
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
    (expression.property.name === 'Injectable' ||
      expression.property.name === 'Service')
  ) {
    return expression.property.name;
  }

  return undefined;
}

function createTemporaryDisableSuggestion(
  sourceCode,
  node,
  ruleName,
  migrationNote,
) {
  return {
    desc: 'Insert a temporary eslint-disable-next-line comment with a migration note.',
    fix(fixer) {
      const lineStart = sourceCode.getIndexFromLoc({
        line: node.loc.start.line,
        column: 0,
      });
      return fixer.insertTextBeforeRange(
        [lineStart, lineStart],
        `// eslint-disable-next-line craft-ng/${ruleName} -- ${migrationNote}\n`,
      );
    },
  };
}
