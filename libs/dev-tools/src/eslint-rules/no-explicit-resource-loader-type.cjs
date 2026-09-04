const CORE_RESOURCE_NAMES = new Set(['asyncProcess', 'mutation', 'query']);
const EFFECT_RESOURCE_NAMES = new Set([
  'asyncProcessEffect',
  'mutationEffect',
  'queryEffect',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow explicit parameter and return type annotations on Craft resource loaders so their contracts remain inferred from the resource configuration and yielded operations.',
    },
    schema: [],
    messages: {
      parameter:
        'Do not annotate resource loader parameters explicitly: query, mutation, and asyncProcess infer params from their configuration. An annotation can hide a mismatch between params, the loader, and the yielded request; fix the resource inputs instead.',
      return:
        'Do not annotate a resource loader return type explicitly: Craft infers the generator result and yielded dependencies from the loader body. A manual Generator or Promise type can hide the actual resource contract; remove it and fix the yielded operation if needed.',
    },
  },

  create(context) {
    const resourceNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;

        const source = node.source.value;
        const allowed =
          source === '@craft-ts/core'
            ? CORE_RESOURCE_NAMES
            : source === '@craft-ts/effect'
              ? EFFECT_RESOURCE_NAMES
              : undefined;
        if (!allowed) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = getIdentifierName(specifier.imported);
          if (imported && allowed.has(imported)) {
            resourceNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !resourceNames.has(node.callee.name)
        ) {
          return;
        }

        const config = node.arguments.find(
          (argument) => argument.type === 'ObjectExpression',
        );
        if (!config) return;

        for (const property of config.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            getPropertyName(property.key) !== 'loader'
          ) {
            continue;
          }

          reportLoaderSignature(property.value, context);
        }
      },
    };
  },
};

function reportLoaderSignature(node, context) {
  const loader = unwrap(node);
  if (!isFunction(loader)) return;

  for (const parameter of loader.params) {
    const annotation = getParameterTypeAnnotation(parameter);
    if (annotation) {
      context.report({ node: annotation, messageId: 'parameter' });
    }
  }

  if (loader.returnType) {
    context.report({ node: loader.returnType, messageId: 'return' });
  }
}

function getParameterTypeAnnotation(parameter) {
  if (parameter.type === 'AssignmentPattern') {
    return getParameterTypeAnnotation(parameter.left);
  }

  return parameter.typeAnnotation;
}

function isFunction(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

function unwrap(node) {
  let current = node;
  while (
    current?.type === 'TSAsExpression' ||
    current?.type === 'TSTypeAssertion' ||
    current?.type === 'ChainExpression'
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function getPropertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}
