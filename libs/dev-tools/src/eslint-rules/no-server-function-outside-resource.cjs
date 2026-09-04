const RESOURCE_PRIMITIVES = new Set([
  'asyncProcess',
  'asyncProcessEffect',
  'mutation',
  'mutationEffect',
  'query',
  'queryEffect',
]);

const CORE_PACKAGES = new Set(['@craft-ts/core', '@craft-ts/effect']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require server-function calls to be owned by a query, mutation, or asyncProcess loader so loading, cancellation, exceptions, and dependency tracking remain visible.',
    },
    schema: [],
    messages: {
      outsideResource:
        'Server-function calls must be returned by a query, mutation, or asyncProcess loader because the yieldable client facade needs resource ownership for loading, cancellation, exceptions, and dependency tracking. Do not fire it from an event handler or another synchronous callback.',
    },
  },

  create(context) {
    if (isExemptFile(context.filename ?? '')) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const serverFunctionBindings = new Set();
    const serverFunctionNamespaces = new Set();
    const resourceBindings = new Set();
    const resourceNamespaces = new Set();

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value ?? '');

        if (isServerFunctionClientModule(source)) {
          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier') {
              serverFunctionBindings.add(specifier.local.name);
            } else if (specifier.type === 'ImportDefaultSpecifier') {
              serverFunctionBindings.add(specifier.local.name);
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              serverFunctionNamespaces.add(specifier.local.name);
            }
          }
        }

        if (!CORE_PACKAGES.has(source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const imported = getIdentifierName(specifier.imported);
            if (imported && RESOURCE_PRIMITIVES.has(imported)) {
              resourceBindings.add(specifier.local.name);
            }
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            resourceNamespaces.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (!isServerFunctionCall(node)) return;
        if (isInsideResourceLoader(node)) return;

        context.report({ node: node.callee, messageId: 'outsideResource' });
      },
    };

    function isServerFunctionCall(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier') {
        return serverFunctionBindings.has(callee.name);
      }
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        serverFunctionNamespaces.has(callee.object.name)
      );
    }

    function isInsideResourceLoader(node) {
      let current = node.parent;
      let insideLoaderProperty = false;

      while (current) {
        if (
          current.type === 'Property' &&
          getPropertyName(current.key) === 'loader' &&
          current.value
        ) {
          insideLoaderProperty = true;
        }

        if (
          insideLoaderProperty &&
          current.type === 'CallExpression' &&
          isResourcePrimitiveCall(current)
        ) {
          return true;
        }

        current = current.parent;
      }

      return false;
    }

    function isResourcePrimitiveCall(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier') {
        return resourceBindings.has(callee.name);
      }
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        resourceNamespaces.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        RESOURCE_PRIMITIVES.has(callee.property.name)
      );
    }
  },
};

function isExemptFile(filename) {
  return (
    /(?:^|[/\\])(?:[^/\\]+\.)?(?:spec|test)\.[cm]?[jt]sx?$/.test(filename) ||
    /\.fn-client\.[cm]?[jt]sx?$/.test(filename)
  );
}

function isServerFunctionClientModule(source) {
  return /\.fn-client(?:\.[cm]?[jt]sx?)?$/.test(source);
}

function getPropertyName(node) {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function getIdentifierName(node) {
  if (!node) return undefined;
  return node.type === 'Identifier' ? node.name : String(node.value ?? '');
}
