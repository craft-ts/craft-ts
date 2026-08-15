const REACTIVE_VALUE_BRAND = 'RAW_REACTIVE_VALUE';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Craft reactive readers to be delegated with yield* inside generator functions.',
    },
    schema: [],
    messages: {
      requireYield:
        'Craft reactive values must be read with `yield*` inside a generator function.',
      requireGenerator:
        'A function that reads a Craft reactive value must be a generator and delegate the read with `yield*`.',
      missingTypeInfo:
        'This rule requires TypeScript type information to identify Craft reactive readers.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;
    let reportedMissingTypeInfo = false;

    return {
      Program() {
        if (!checker || !nodeMap) {
          context.report({
            node: sourceCode.ast,
            messageId: 'missingTypeInfo',
          });
          reportedMissingTypeInfo = true;
        }
      },
      CallExpression(node) {
        if (reportedMissingTypeInfo || !checker || !nodeMap) return;
        if (isConsumed(node) || !isReactiveReader(node)) return;

        const fn = nearestFunction(node);
        context.report({
          node,
          messageId: fn?.generator ? 'requireYield' : 'requireGenerator',
        });
      },
    };

    function isReactiveReader(node) {
      const tsNode = nodeMap.get(node.callee);
      if (!tsNode) return false;
      return hasBrand(checker.getTypeAtLocation(tsNode), new Set());
    }

    function hasBrand(type, seen) {
      if (!type || seen.has(type)) return false;
      seen.add(type);
      if (type.isUnion?.() || type.isIntersection?.()) {
        return type.types.some((part) => hasBrand(part, seen));
      }
      return checker
        .getPropertiesOfType(type)
        .some((property) =>
          String(property.escapedName).includes(REACTIVE_VALUE_BRAND),
        );
    }
  },
};

function isConsumed(node) {
  let parent = node.parent;
  while (
    parent &&
    ['ChainExpression', 'TSAsExpression', 'TSTypeAssertion'].includes(
      parent.type,
    )
  ) {
    parent = parent.parent;
  }
  if (parent?.type === 'YieldExpression' && parent.delegate) return true;
  return (
    parent?.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'craftUse'
  );
}

function nearestFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionExpression' ||
      current.type === 'FunctionDeclaration'
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}
