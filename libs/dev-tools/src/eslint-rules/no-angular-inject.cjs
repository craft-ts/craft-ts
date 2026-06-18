module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular inject() usage so dependencies go through craftService or toCraftService.',
    },
    hasSuggestions: true,
    schema: [],
  },
  create(context) {
    const angularNamespaceImports = new Set();
    const angularInjectImports = new Map();
    const reportedInjectImports = new Set();
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
            specifier.imported.name === 'inject'
          ) {
            angularInjectImports.set(specifier.local.name, specifier);
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            angularNamespaceImports.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const angularInjectNode = getAngularInjectCallee(
          node.callee,
          angularInjectImports,
          angularNamespaceImports,
        );
        if (!angularInjectNode) {
          return;
        }

        if (node.callee.type === 'Identifier') {
          reportedInjectImports.add(node.callee.name);
        }

        const tokenText = getInjectTokenText(node.arguments[0], sourceCode);
        const helperName = getRecommendedInjectorName(node.arguments[0]);

        context.report({
          node: angularInjectNode,
          message: createInjectMessage(tokenText, helperName),
          suggest: [
            createTemporaryDisableSuggestion(
              sourceCode,
              angularInjectNode,
              'no-angular-inject',
              helperName
                ? `replace this Angular inject(${tokenText}) call with ${helperName} from a craftService/toCraftService adapter`
                : 'replace this Angular inject() call with a craftService/toCraftService injector',
            ),
          ],
        });
      },
      'Program:exit'() {
        for (const [localName, specifier] of angularInjectImports) {
          if (reportedInjectImports.has(localName)) {
            continue;
          }

          context.report({
            node: specifier,
            message:
              'Angular inject() is forbidden. Import and use the injectX helper exposed by a craftService/toCraftService adapter instead.',
          });
        }
      },
    };
  },
};

function isAngularModule(sourceValue) {
  return typeof sourceValue === 'string' && sourceValue.startsWith('@angular/');
}

function getAngularInjectCallee(
  callee,
  angularInjectImports,
  angularNamespaceImports,
) {
  if (callee.type === 'Identifier' && angularInjectImports.has(callee.name)) {
    return callee;
  }

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    angularNamespaceImports.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'inject'
  ) {
    return callee.property;
  }

  return undefined;
}

function createInjectMessage(tokenText, helperName) {
  if (!helperName) {
    return 'Angular inject() is forbidden. Use the injectX helper exposed by a craftService/toCraftService adapter instead.';
  }

  return `Angular inject(${tokenText}) is forbidden. Use ${helperName} from a craftService/toCraftService adapter instead.`;
}

function getInjectTokenText(argument, sourceCode) {
  if (!argument) {
    return '';
  }

  return sourceCode.getText(argument);
}

function getRecommendedInjectorName(argument) {
  const tokenName = getTokenName(argument);
  if (!tokenName) {
    return undefined;
  }

  return `inject${toPascalCase(tokenName)}`;
}

function getTokenName(argument) {
  if (!argument) {
    return undefined;
  }

  if (argument.type === 'Identifier') {
    return argument.name;
  }

  if (
    argument.type === 'MemberExpression' &&
    !argument.computed &&
    argument.property.type === 'Identifier'
  ) {
    return argument.property.name;
  }

  return undefined;
}

function toPascalCase(value) {
  return value
    .replace(/^[^A-Za-z$]+/, '')
    .split(/[^A-Za-z0-9$]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
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
