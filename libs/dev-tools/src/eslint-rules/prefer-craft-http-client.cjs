module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular HttpClient usage in favor of CraftHttpClient.',
    },
    hasSuggestions: true,
    schema: [],
  },
  create(context) {
    const angularHttpNamespaceImports = new Set();
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@angular/common/http') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'HttpClient'
          ) {
            context.report({
              node: specifier,
              message:
                'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
              suggest: [
                createTemporaryDisableSuggestion(
                  sourceCode,
                  specifier,
                  'prefer-craft-http-client',
                  'migrate this usage to CraftHttpClient',
                ),
              ],
            });
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            angularHttpNamespaceImports.add(specifier.local.name);
          }
        }
      },
      MemberExpression(node) {
        if (
          node.computed ||
          node.object.type !== 'Identifier' ||
          !angularHttpNamespaceImports.has(node.object.name) ||
          node.property.type !== 'Identifier' ||
          node.property.name !== 'HttpClient'
        ) {
          return;
        }

        context.report({
          node: node.property,
          message:
            'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
          suggest: [
            createTemporaryDisableSuggestion(
              sourceCode,
              node,
              'prefer-craft-http-client',
              'migrate this usage to CraftHttpClient',
            ),
          ],
        });
      },
      TSQualifiedName(node) {
        if (
          node.left.type !== 'Identifier' ||
          !angularHttpNamespaceImports.has(node.left.name) ||
          node.right.type !== 'Identifier' ||
          node.right.name !== 'HttpClient'
        ) {
          return;
        }

        context.report({
          node: node.right,
          message:
            'Angular HttpClient is forbidden. Use CraftHttpClient from @craft-ng/core instead.',
          suggest: [
            createTemporaryDisableSuggestion(
              sourceCode,
              node,
              'prefer-craft-http-client',
              'migrate this usage to CraftHttpClient',
            ),
          ],
        });
      },
    };
  },
};

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
