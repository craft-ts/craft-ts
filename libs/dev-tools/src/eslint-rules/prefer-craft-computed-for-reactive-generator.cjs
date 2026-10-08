function isCallTo(node, name) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === name
  );
}

function getGenerator(node, sourceCode, seen = new Set()) {
  if (
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'ArrowFunctionExpression'
  ) {
    return node.generator ? node : undefined;
  }

  if (node?.type === 'CallExpression' && isCallTo(node, 'craftGen')) {
    return getGenerator(node.arguments[0], sourceCode, seen);
  }

  if (node?.type === 'Identifier' && !seen.has(node.name)) {
    seen.add(node.name);
    const scope = sourceCode.getScope(node);
    let current = scope;
    while (current) {
      const variable = current.set.get(node.name);
      if (variable) {
        const definition = variable.defs.find(
          (candidate) =>
            candidate.type === 'Variable' || candidate.type === 'FunctionName',
        );
        if (!definition) return undefined;
        return getGenerator(
          definition.type === 'FunctionName'
            ? definition.node
            : definition.node.init,
          sourceCode,
          seen,
        );
      }
      current = current.upper;
    }
  }

  return undefined;
}

function hasYieldedReactiveRead(node, checker, nodeMap) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    return false;
  }
  if (node.type === 'YieldExpression' && node.delegate) {
    const call = node.argument;
    if (call?.type !== 'CallExpression') return false;
    if (!checker || !nodeMap) return false;

    const tsCallee = nodeMap.get(call.callee);
    return tsCallee
      ? hasReactiveValueBrand(checker, checker.getTypeAtLocation(tsCallee), new Set())
      : false;
  }

  return Object.entries(node).some(([key, value]) => {
    if (key === 'parent') return false;
    if (Array.isArray(value)) {
      return value.some((child) =>
        hasYieldedReactiveRead(child, checker, nodeMap),
      );
    }
    return hasYieldedReactiveRead(value, checker, nodeMap);
  });
}

function hasReactiveValueBrand(checker, type, seen) {
  if (!type || seen.has(type)) return false;
  seen.add(type);
  if (type.isUnion?.() || type.isIntersection?.()) {
    return type.types.some((part) => hasReactiveValueBrand(checker, part, seen));
  }
  return checker.getPropertiesOfType(type).some((property) =>
    String(property.escapedName).includes('RAW_REACTIVE_VALUE'),
  );
}

function isPureDerivedGenerator(generator, checker, nodeMap) {
  if (
    !generator ||
    generator.params.length !== 0 ||
    generator.body.type !== 'BlockStatement' ||
    generator.body.body.length !== 1
  ) {
    return false;
  }

  const [statement] = generator.body.body;
  return (
    statement.type === 'ReturnStatement' &&
    statement.argument !== null &&
    hasYieldedReactiveRead(statement.argument, checker, nodeMap)
  );
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer craftComputed when a zero-argument generator only returns a value derived from yielded reads.',
      url: 'https://craft-ts.github.io/craft/guide/app/craft-service#shaping-the-public-api',
    },
    schema: [],
    messages: {
      preferComputed:
        'This zero-argument generator only returns a value derived from yielded reads. Declare it with `yield* craftComputed("{{name}}", function* () { ... })` so it is modeled as a reactive computed value.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;

    return {
      CallExpression(node) {
        if (!isCallTo(node, 'craftExpose') || node.arguments.length < 2) return;
        const [nameNode, valueNode] = node.arguments;
        if (
          nameNode.type !== 'Literal' ||
          typeof nameNode.value !== 'string'
        ) {
          return;
        }

        const generator = getGenerator(valueNode, sourceCode);
        if (isPureDerivedGenerator(generator, checker, nodeMap)) {
          context.report({
            node,
            messageId: 'preferComputed',
            data: { name: nameNode.value },
          });
        }
      },
    };
  },
};
