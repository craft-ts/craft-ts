const YIELDABLE_METHOD_NAME = 'YIELDABLE_METHOD';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require callbacks returned from a craftComponent factory to use craftMethod when they call yieldable Craft methods.',
    },
    schema: [],
    messages: {
      requireCraftMethod:
        "Callback '{{name}}' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      missingTypeInfo:
        'This rule requires TypeScript type information to identify yieldable Craft methods.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const esTreeNodeToTSNodeMap = parserServices?.esTreeNodeToTSNodeMap;
    let reportedMissingTypeInfo = false;

    return {
      Program() {
        if (!checker || !esTreeNodeToTSNodeMap) {
          context.report({
            node: sourceCode.ast,
            messageId: 'missingTypeInfo',
          });
          reportedMissingTypeInfo = true;
        }
      },

      CallExpression(node) {
        if (
          reportedMissingTypeInfo ||
          !checker ||
          !esTreeNodeToTSNodeMap ||
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4
        ) {
          return;
        }

        inspectFactory(node.arguments[2]);
      },
    };

    function inspectFactory(factory) {
      const localFunctions = collectLocalFunctions(factory);
      const returnedObject = findReturnedObject(factory);

      if (!returnedObject) return;

      for (const property of returnedObject.properties) {
        if (property.type !== 'Property') continue;

        const callback = resolveCallback(property.value, localFunctions);
        if (!callback) continue;

        const yieldableCalls = [];
        walkFunctionBody(callback, (node) => {
          if (node.type === 'CallExpression' && isDirectYieldableCall(node)) {
            yieldableCalls.push(node);
          }
        });

        if (yieldableCalls.length === 0) continue;

        context.report({
          node: callback,
          messageId: 'requireCraftMethod',
          data: { name: getPropertyName(property) },
        });
      }
    }

    function collectLocalFunctions(factory) {
      const localFunctions = new Map();
      if (!factory) return localFunctions;

      if (
        factory.type === 'ArrowFunctionExpression' &&
        factory.body.type === 'ObjectExpression'
      ) {
        return localFunctions;
      }

      walkFunctionBody(factory.body, (node) => {
        if (node.type === 'FunctionDeclaration' && node.id) {
          localFunctions.set(node.id.name, node);
          return 'skip';
        }

        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          node.init &&
          isFunctionNode(node.init)
        ) {
          localFunctions.set(node.id.name, node.init);
        }
      });

      return localFunctions;
    }

    function findReturnedObject(factory) {
      if (!factory) return undefined;

      if (
        factory.type === 'ArrowFunctionExpression' &&
        factory.body.type === 'ObjectExpression'
      ) {
        return factory.body;
      }

      let returnedObject;
      walkFunctionBody(factory.body, (node) => {
        if (
          !returnedObject &&
          node.type === 'ReturnStatement' &&
          node.argument?.type === 'ObjectExpression'
        ) {
          returnedObject = node.argument;
          return 'skip';
        }
      });

      return returnedObject;
    }

    function resolveCallback(value, localFunctions) {
      if (isFunctionNode(value)) {
        return value;
      }

      if (value?.type === 'Identifier') {
        return localFunctions.get(value.name);
      }

      return undefined;
    }

    function isDirectYieldableCall(node) {
      const tsNode = esTreeNodeToTSNodeMap.get(node.callee);
      if (!tsNode) return false;

      const calleeType = checker.getTypeAtLocation(tsNode);
      if (hasYieldableBrand(calleeType, new Set())) {
        return true;
      }

      const signature = calleeType.getCallSignatures?.()[0];
      return signature ? returnsGenerator(signature.getReturnType()) : false;
    }

    function hasYieldableBrand(type, seen) {
      if (!type || seen.has(type)) return false;
      seen.add(type);

      if (type.isUnion?.() || type.isIntersection?.()) {
        return type.types.some((part) => hasYieldableBrand(part, seen));
      }

      return checker
        .getPropertiesOfType(type)
        .some((property) =>
          String(property.escapedName).includes(YIELDABLE_METHOD_NAME),
        );
    }

    function returnsGenerator(type) {
      const symbol = type.aliasSymbol ?? type.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      if (name === 'Generator' || name === 'YieldableInvocation') {
        return true;
      }

      if (type.isUnion?.()) {
        return type.types.every((part) => returnsGenerator(part));
      }

      return (
        checker
          .getPropertiesOfType(type)
          .some((property) => property.name === 'next') &&
        checker
          .getPropertiesOfType(type)
          .some((property) => property.name === 'return')
      );
    }

    function getPropertyName(property) {
      if (property.key.type === 'Identifier') return property.key.name;
      if (property.key.type === 'Literal') return String(property.key.value);
      return '<anonymous>';
    }

    function walkFunctionBody(node, visit) {
      walk(node, (child) => {
        if (child !== node && isFunctionNode(child)) {
          return 'skip';
        }
        return visit(child);
      });
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((item) => walk(item, visit));
        } else {
          walk(child, visit);
        }
      }
    }

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration'
      );
    }
  },
};
