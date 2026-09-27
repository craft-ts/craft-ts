const { templateRegions } = require('./craft-template-region.cjs');

module.exports = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Require yieldable Craft methods called from a component template to be delegated with yield*.',
    },
    schema: [],
    messages: {
      requireYield:
        'Yieldable Craft method calls in templates must be delegated with `yield*`.',
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
          node.arguments.length < 3
        ) {
          return;
        }

        const wrappers = collectLocalWrappers(node.arguments[2]);
        for (const region of templateRegions(node.arguments[2])) {
          inspectTemplate(region, wrappers);
        }
      },
    };

    function inspectTemplate(template, localWrappers) {
      walk(template, (node) => {
        if (node !== template && isNestedCraftComponent(node)) {
          return 'skip';
        }

        if (
          node.type !== 'CallExpression' ||
          !isYieldableCall(node, localWrappers)
        ) {
          return;
        }

        if (isDelegated(node)) {
          return;
        }

        context.report({
          node,
          messageId: 'requireYield',
          fix: (fixer) =>
            createFix(fixer, node, findLocalWrapper(node, localWrappers)),
        });
      });
    }

    function isYieldableCall(node, localWrappers) {
      if (isDirectYieldableCall(node)) {
        return true;
      }

      return Boolean(findLocalWrapper(node, localWrappers));
    }

    // What must be delegated is what hands back an invocation. A craftMethod
    // carries the same brand but runs when it is called and returns its result,
    // so the brand alone does not make a call a delegation.
    function isDirectYieldableCall(node) {
      const tsNode = esTreeNodeToTSNodeMap.get(node.callee);
      if (!tsNode) return false;

      const calleeType = checker.getTypeAtLocation(tsNode);
      const signature = calleeType.getCallSignatures?.()[0];
      return signature ? returnsGenerator(signature.getReturnType()) : false;
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

    // A local function the component declares and a binding then calls: the
    // delegation it forgot is the one inside that function.
    function collectLocalWrappers(factory) {
      const wrappers = new Map();
      if (!factory?.body) return wrappers;

      const localFunctions = new Map();
      walk(factory.body, (node) => {
        if (isFunctionNode(node)) {
          if (node.type === 'FunctionDeclaration' && node.id) {
            localFunctions.set(node.id.name, node);
          }
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

      for (const [name, functionNode] of localFunctions) {
        const yieldableCalls = [];
        walkFunctionBody(functionNode.body, (node) => {
          if (
            node.type === 'CallExpression' &&
            isDirectYieldableCall(node) &&
            !isDelegated(node)
          ) {
            yieldableCalls.push(node);
          }
        });

        if (yieldableCalls.length > 0) {
          wrappers.set(name, { functionNode, yieldableCalls });
        }
      }

      return wrappers;
    }

    function findLocalWrapper(node, localWrappers) {
      if (node.callee.type !== 'Identifier') {
        return undefined;
      }
      return localWrappers?.get(node.callee.name);
    }

    function isDelegated(node) {
      const parent = skipParens(node.parent);
      return parent?.type === 'YieldExpression' && parent.delegate;
    }

    function createFix(fixer, node, wrapper) {
      const fixes = [];
      const text = sourceCode.getText(node);
      const functionNode = nearestFunction(node);

      if (functionNode?.generator) {
        fixes.push(fixer.replaceText(node, `yield* ${text}`));
      } else if (!functionNode || functionNode.async) {
        return undefined;
      } else {
        const templateFix = createGeneratorCallbackFix(
          fixer,
          functionNode,
          node,
          text,
        );
        if (!templateFix) {
          return undefined;
        }
        fixes.push(
          ...(Array.isArray(templateFix) ? templateFix : [templateFix]),
        );
      }

      if (wrapper) {
        fixes.push(...createWrapperFixes(fixer, wrapper));
      }

      return fixes;
    }

    function createGeneratorCallbackFix(fixer, functionNode, node, text) {
      const parent = functionNode.parent;
      if (
        parent?.type === 'Property' &&
        parent.value === functionNode &&
        parent.method
      ) {
        return [
          fixer.insertTextBefore(parent.key, '*'),
          fixer.replaceText(node, `yield* ${text}`),
        ];
      }

      if (functionNode.type === 'FunctionExpression') {
        const functionToken = sourceCode.getFirstToken(functionNode);
        return [
          fixer.insertTextAfter(functionToken, '*'),
          fixer.replaceText(node, `yield* ${text}`),
        ];
      }

      if (functionNode.type === 'ArrowFunctionExpression') {
        const body = functionNode.body;
        if (body === node || skipParensDown(body) === node) {
          const params = functionNode.params
            .map((parameter) => sourceCode.getText(parameter))
            .join(', ');
          return fixer.replaceText(
            functionNode,
            `function* (${params}) { yield* ${text}; }`,
          );
        }

        if (body.type === 'BlockStatement') {
          return [
            fixer.replaceTextRange(
              [functionNode.range[0], body.range[0]],
              `function* (${functionNode.params
                .map((parameter) => sourceCode.getText(parameter))
                .join(', ')}) `,
            ),
            fixer.replaceText(node, `yield* ${text}`),
          ];
        }
      }

      return undefined;
    }

    function createWrapperFixes(fixer, wrapper) {
      const fixes = [];
      const functionNode = wrapper.functionNode;

      if (!functionNode.generator) {
        const generatorFix = createGeneratorFunctionFix(fixer, functionNode);
        if (generatorFix) {
          fixes.push(
            ...(Array.isArray(generatorFix) ? generatorFix : [generatorFix]),
          );
        }

        if (
          functionNode.type === 'ArrowFunctionExpression' &&
          functionNode.body.type !== 'BlockStatement'
        ) {
          return fixes;
        }
      }

      for (const node of wrapper.yieldableCalls) {
        fixes.push(
          fixer.replaceText(node, `yield* ${sourceCode.getText(node)}`),
        );
      }

      return fixes;
    }

    function createGeneratorFunctionFix(fixer, functionNode) {
      if (functionNode.type === 'ArrowFunctionExpression') {
        if (functionNode.body.type !== 'BlockStatement') {
          return fixer.replaceText(
            functionNode,
            `function* (${functionNode.params
              .map((parameter) => sourceCode.getText(parameter))
              .join(', ')}) { return yield* ${sourceCode.getText(
              functionNode.body,
            )}; }`,
          );
        }

        return fixer.replaceTextRange(
          [functionNode.range[0], functionNode.body.range[0]],
          `function* (${functionNode.params
            .map((parameter) => sourceCode.getText(parameter))
            .join(', ')}) `,
        );
      }

      const functionToken = sourceCode.getFirstToken(functionNode);
      return fixer.insertTextAfter(functionToken, '*');
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

    function walkFunctionBody(node, visit) {
      walk(node, (child) => {
        if (child !== node && isFunctionNode(child)) {
          return 'skip';
        }
        return visit(child);
      });
    }

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration'
      );
    }

    function isNestedCraftComponent(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'craftComponent'
      );
    }

    function skipParens(node) {
      let current = node;
      while (current?.type === 'ParenthesizedExpression') {
        current = current.parent;
      }
      return current;
    }

    function skipParensDown(node) {
      let current = node;
      while (current?.type === 'ParenthesizedExpression') {
        current = current.expression;
      }
      return current;
    }
  },
};
