const RESOURCE_PRIMITIVES = new Set(['asyncProcess', 'mutation', 'query']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require query, mutation, and asyncProcess loaders to be generators so asynchronous work stays visible to the Craft resource lifecycle instead of being hidden in a native Promise.',
    },
    schema: [],
    messages: {
      generator:
        'Resource loaders must be generator functions: a plain or async return hides remote dependencies from the resource lifecycle and can lose cancellation and exception tracking. Use function* and yield* Craft utilities such as CraftHttpClient, CraftBinaryHttpClient, or craftSleep.',
    },
  },

  create(context) {
    if (isExemptFile(context.filename ?? '')) return {};

    const resourceBindings = new Set();
    const resourceNamespaces = new Set();
    const craftGenBindings = new Set();

    return {
      ImportDeclaration(node) {
        const source = String(node.source.value ?? '');
        if (source !== '@craft-ts/core') return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const imported = getIdentifierName(specifier.imported);
            if (imported && RESOURCE_PRIMITIVES.has(imported)) {
              resourceBindings.add(specifier.local.name);
            }
            if (imported === 'craftGen') {
              craftGenBindings.add(specifier.local.name);
            }
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            resourceNamespaces.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (!isResourcePrimitiveCall(node)) return;

        for (const argument of node.arguments) {
          if (argument.type !== 'ObjectExpression') continue;

          for (const property of argument.properties) {
            if (
              property.type !== 'Property' ||
              property.computed ||
              getPropertyName(property.key) !== 'loader'
            ) {
              continue;
            }

            if (!isGeneratorFunction(property.value, craftGenBindings)) {
              context.report({ node: property.value, messageId: 'generator' });
            }
          }
        }
      },
    };

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

function isGeneratorFunction(node, craftGenBindings) {
  if (
    (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') &&
    node.generator === true
  ) {
    return true;
  }

  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    craftGenBindings.has(node.callee.name) &&
    node.arguments.length === 1 &&
    isGeneratorFunction(node.arguments[0], craftGenBindings)
  );
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

function isExemptFile(filename) {
  return /(?:^|[/\\])(?:[^/\\]+\.)?(?:spec|test)\.[cm]?[jt]sx?$/.test(
    filename,
  );
}
