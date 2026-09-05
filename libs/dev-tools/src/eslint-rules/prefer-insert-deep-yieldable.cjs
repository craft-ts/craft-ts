const CORE_PRIMITIVE_NAMES = new Set([
  'state',
  'query',
  'mutation',
  'asyncProcess',
  'queryParam',
  'queryParams',
]);

const EFFECT_PRIMITIVE_NAMES = new Set([
  'queryEffect',
  'mutationEffect',
  'asyncProcessEffect',
]);

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer insertDeepYieldable on a Craft primitive over adapting one of its output properties with deepYieldable.',
    },
    schema: [],
    messages: {
      preferInsert:
        'Prefer `insertDeepYieldable()` on the primitive that creates `{{object}}`, then read `{{object}}.{{property}}` directly instead of calling `deepYieldable(...)` here.',
    },
  },

  create(context) {
    const primitiveNames = new Set();
    const deepYieldableNames = new Set();
    const primitiveGenerators = new Map();
    const primitiveOutputs = new Map();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;

        const source = node.source.value;
        const allowed =
          source === '@craft-ts/core'
            ? CORE_PRIMITIVE_NAMES
            : source === '@craft-ts/effect'
              ? EFFECT_PRIMITIVE_NAMES
              : undefined;

        if (allowed) {
          for (const specifier of node.specifiers) {
            if (specifier.type !== 'ImportSpecifier') continue;
            const imported = getIdentifierName(specifier.imported);
            if (imported && allowed.has(imported)) {
              primitiveNames.add(specifier.local.name);
            }
          }
        }

        if (source !== '@craft-ts/core') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'deepYieldable'
          ) {
            deepYieldableNames.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') return;

        const initializer = unwrap(node.init);
        const primitiveCall = getDirectPrimitiveCall(
          initializer,
          primitiveNames,
        );
        if (primitiveCall) {
          primitiveGenerators.set(node.id.name, primitiveCall);
          return;
        }

        const yieldedPrimitive = getYieldedPrimitiveCall(
          initializer,
          primitiveNames,
        );
        if (yieldedPrimitive) {
          primitiveOutputs.set(node.id.name, yieldedPrimitive);
          return;
        }

        const generatorName = getYieldedIdentifier(initializer);
        if (generatorName && primitiveGenerators.has(generatorName)) {
          primitiveOutputs.set(
            node.id.name,
            primitiveGenerators.get(generatorName),
          );
          return;
        }

        if (
          node.init?.type === 'Identifier' &&
          primitiveGenerators.has(node.init.name)
        ) {
          primitiveGenerators.set(
            node.id.name,
            primitiveGenerators.get(node.init.name),
          );
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !deepYieldableNames.has(node.callee.name) ||
          node.arguments.length !== 1
        ) {
          return;
        }

        const argument = unwrap(node.arguments[0]);
        if (
          argument?.type !== 'MemberExpression' ||
          argument.computed ||
          argument.object.type !== 'Identifier' ||
          argument.property.type !== 'Identifier' ||
          !primitiveOutputs.has(argument.object.name)
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'preferInsert',
          data: {
            object: argument.object.name,
            property: argument.property.name,
          },
        });
      },
    };
  },
};

function getDirectPrimitiveCall(node, primitiveNames) {
  return isPrimitiveCall(node, primitiveNames) ? node : undefined;
}

function getYieldedPrimitiveCall(node, primitiveNames) {
  if (!node || node.type !== 'YieldExpression' || !node.delegate) {
    return undefined;
  }
  const yielded = unwrap(node.argument);
  return isPrimitiveCall(yielded, primitiveNames) ? yielded : undefined;
}

function isPrimitiveCall(node, primitiveNames) {
  return Boolean(
    node?.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      primitiveNames.has(node.callee.name),
  );
}

function getYieldedIdentifier(node) {
  const expression = unwrap(node);
  if (
    !expression ||
    expression.type !== 'YieldExpression' ||
    !expression.delegate
  ) {
    return undefined;
  }
  const argument = unwrap(expression.argument);
  return argument?.type === 'Identifier' ? argument.name : undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    [
      'ChainExpression',
      'ParenthesizedExpression',
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
