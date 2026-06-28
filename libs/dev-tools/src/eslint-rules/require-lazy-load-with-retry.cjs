'use strict';

const LAZY_PROPERTIES = new Set([
  'loadComponent',
  'loadChildren',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require lazy route imports to use the withRetry helper so browser-cached module failures can be retried.',
    },
    fixable: 'code',
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const importsByLoader = new Map();

    return {
      ImportExpression(node) {
        const loader = enclosingLazyLoader(node);
        if (!loader || isWrappedWithRetry(node)) return;

        const imports = importsByLoader.get(loader) ?? [];
        imports.push(node);
        importsByLoader.set(loader, imports);
      },
      'Program:exit'() {
        for (const [loader, imports] of importsByLoader) {
          context.report({
            node: imports[0],
            message:
              'Lazy route imports must be wrapped with withRetry(import(...)).',
            fix(fixer) {
              const parameterFixes = addWithRetryParameter(
                fixer,
                sourceCode,
                loader,
              );
              if (!parameterFixes) return null;

              return [
                ...parameterFixes,
                ...imports.flatMap((moduleImport) => [
                  fixer.insertTextBefore(moduleImport, 'withRetry('),
                  fixer.insertTextAfter(moduleImport, ')'),
                ]),
              ];
            },
          });
        }
      },
    };
  },
};

function enclosingLazyLoader(node) {
  let current = node.parent;
  while (current) {
    if (
      (current.type === 'ArrowFunctionExpression' ||
        current.type === 'FunctionExpression') &&
      current.parent?.type === 'Property' &&
      LAZY_PROPERTIES.has(propertyName(current.parent)) &&
      isInsideCraftRoute(current.parent)
    ) {
      return current;
    }
    if (current.type === 'Property' || current.type === 'Program') return null;
    current = current.parent;
  }
  return null;
}

function isInsideCraftRoute(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      (current.callee.name === 'craftRoute' ||
        current.callee.name === 'craftRoutes')
    ) {
      return true;
    }
    if (current.type === 'Program') return false;
    current = current.parent;
  }
  return false;
}

function propertyName(property) {
  if (property.computed) return undefined;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return property.key.value;
  return undefined;
}

function isWrappedWithRetry(node) {
  return (
    node.parent?.type === 'CallExpression' &&
    node.parent.callee.type === 'Identifier' &&
    node.parent.callee.name === 'withRetry' &&
    node.parent.arguments[0] === node
  );
}

function addWithRetryParameter(fixer, sourceCode, loader) {
  if (loader.params.length === 0) {
    const arrow = sourceCode.getTokenBefore(loader.body, {
      filter: (token) => token.value === '=>',
    });
    if (!arrow) return null;

    const closeParen = sourceCode.getTokenBefore(arrow);
    const openParen = closeParen && sourceCode.getTokenBefore(closeParen);
    if (openParen?.value !== '(' || closeParen?.value !== ')') return null;
    return [
      fixer.replaceTextRange(
        [openParen.range[1], closeParen.range[0]],
        '{ withRetry }',
      ),
    ];
  }

  if (loader.params.length !== 1 || loader.params[0].type !== 'ObjectPattern') {
    return null;
  }

  const pattern = loader.params[0];
  if (
    pattern.properties.some(
      (property) =>
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.key.name === 'withRetry',
    )
  ) {
    return [];
  }

  const closingBrace = sourceCode.getLastToken(pattern);
  const prefix = pattern.properties.length > 0 ? ', ' : '';
  return [fixer.insertTextBefore(closingBrace, `${prefix}withRetry`)];
}
