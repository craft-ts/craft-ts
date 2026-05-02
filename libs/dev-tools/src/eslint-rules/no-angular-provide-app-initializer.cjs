const path = require('node:path');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular provideAppInitializer() usage outside the internal @craft-ng bridge in favor of onAppStart().',
    },
    schema: [],
  },
  create(context) {
    const filePath = getFilePath(context);
    if (filePath && path.basename(filePath) === 'craft-app-config.ts') {
      return {};
    }

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
            specifier.imported.name === 'provideAppInitializer'
          ) {
            context.report({
              node: specifier,
              message:
                'Angular provideAppInitializer() is forbidden. Model startup work with onAppStart(...) through craftService({ appStart: true }, ...).',
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
          callee.property.name !== 'provideAppInitializer'
        ) {
          return;
        }

        context.report({
          node: callee.property,
          message:
            'Angular provideAppInitializer() is forbidden. Model startup work with onAppStart(...) through craftService({ appStart: true }, ...).',
        });
      },
    };
  },
};

function getFilePath(context) {
  const filePath = context.filename ?? context.getFilename();
  if (!filePath || filePath === '<input>') {
    return undefined;
  }

  return filePath;
}

function isAngularModule(sourceValue) {
  return typeof sourceValue === 'string' && sourceValue.startsWith('@angular/');
}
