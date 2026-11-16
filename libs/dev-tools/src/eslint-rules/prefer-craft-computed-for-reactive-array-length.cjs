function hasReactiveRead(node, checker, nodeMap) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    return false;
  }
  if (node.type === 'YieldExpression' && node.delegate) {
    const call = node.argument;
    if (call?.type === 'CallExpression' && checker && nodeMap) {
      const tsCallee = nodeMap.get(call.callee);
      if (
        tsCallee &&
        hasReactiveArrayBrand(checker, checker.getTypeAtLocation(tsCallee), new Set())
      ) {
        return true;
      }
    }
  }

  return Object.entries(node).some(([key, value]) => {
    if (key === 'parent') return false;
    return Array.isArray(value)
      ? value.some((child) => hasReactiveRead(child, checker, nodeMap))
      : hasReactiveRead(value, checker, nodeMap);
  });
}

function hasReactiveArrayBrand(checker, type, seen) {
  if (!type || seen.has(type)) return false;
  seen.add(type);
  if (type.isUnion?.() || type.isIntersection?.()) {
    return type.types.some((part) => hasReactiveArrayBrand(checker, part, seen));
  }
  return checker.getPropertiesOfType(type).some((property) => {
    if (!String(property.escapedName).includes('RAW_REACTIVE_VALUE')) return false;
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const brandType = declaration
      ? checker.getTypeOfSymbolAtLocation(property, declaration)
      : undefined;
    return (
      brandType?.getCallSignatures().some((signature) => {
        const valueType = checker.getReturnTypeOfSignature(signature);
        return checker.isArrayType(valueType) || checker.isTupleType(valueType);
      }) ?? false
    );
  });
}

function isInsideCraftComputed(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      current.callee.name === 'craftComputed'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer a craftComputed value when a template reads the length of a reactive array.',
    },
    schema: [],
    messages: {
      preferComputed:
        'This reads `.length` from a reactive array in a consumer. Expose a scalar `craftComputed` such as `hasMessages` or `messageCount` from the owning service and read that instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;

    return {
      MemberExpression(node) {
        const isLength =
          (!node.computed &&
            node.property.type === 'Identifier' &&
            node.property.name === 'length') ||
          (node.computed &&
            node.property.type === 'Literal' &&
            node.property.value === 'length');
        if (
          isLength &&
          !isInsideCraftComputed(node) &&
          hasReactiveRead(node.object, checker, nodeMap)
        ) {
          context.report({ node, messageId: 'preferComputed' });
        }
      },
    };
  },
};
