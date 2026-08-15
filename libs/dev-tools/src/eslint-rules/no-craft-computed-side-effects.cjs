const REACTIVE_READ_BRAND = 'RAW_REACTIVE_VALUE';
const INPUT_BRAND = 'INPUT_BRAND';
const YIELDABLE_METHOD_BRAND = 'YIELDABLE_METHOD';
const CORE_PACKAGE = '@craft-ng/core';

const WRITE_METHODS = new Set([
  'add',
  'call',
  'clear',
  'decrement',
  'delete',
  'increment',
  'mutate',
  'patch',
  'refresh',
  'reload',
  'remove',
  'reset',
  'set',
  'submit',
  'unset',
  'update',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow writes and asynchronous work inside craftComputed callbacks; only reactive reads and settled(...) are allowed.',
    },
    schema: [],
    messages: {
      forbidden:
        'Craft computed callbacks may only read reactive Craft values or use `settled(...)`; `{{call}}` is not allowed because it can write or perform asynchronous work.',
      missingTypeInfo:
        'This rule requires TypeScript type information to identify reactive reads and asynchronous Craft calls.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;
    const importedNames = new Map();
    let reportedMissingTypeInfo = false;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          importedNames.set(specifier.local.name, specifier.imported.name);
        }
      },

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
        if (
          reportedMissingTypeInfo ||
          !checker ||
          !nodeMap ||
          !isCraftComputedCall(node)
        ) {
          return;
        }

        const computation = getComputation(node);
        if (!computation) return;

        walk(computation.body ?? computation, (child) => {
          if (child.type === 'AwaitExpression') {
            report(child, 'await');
            return;
          }

          if (child.type === 'CallExpression' && isForbiddenCall(child)) {
            report(child, getCallName(child));
          }
        });
      },
    };

    function isCraftComputedCall(node) {
      return (
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'craftComputed' ||
          importedNames.get(node.callee.name) === 'craftComputed')
      );
    }

    function getComputation(node) {
      const args = node.arguments;
      const functionArguments = args.filter(isFunctionNode);
      return functionArguments.at(-1);
    }

    function isForbiddenCall(node) {
      if (isAllowedSettledCall(node) || isReactiveRead(node)) {
        return false;
      }

      if (isKnownAsyncApi(node) || isKnownWriteMethod(node)) {
        return true;
      }

      const calleeType = getCalleeType(node);
      return (
        hasBrand(calleeType, YIELDABLE_METHOD_BRAND) ||
        returnsGenerator(calleeType) ||
        returnsPromiseLike(calleeType)
      );
    }

    function isAllowedSettledCall(node) {
      return (
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'settled' ||
          importedNames.get(node.callee.name) === 'settled')
      );
    }

    function isReactiveRead(node) {
      const type = getCalleeType(node);
      return (
        hasBrand(type, REACTIVE_READ_BRAND) || hasBrand(type, INPUT_BRAND)
      );
    }

    function isKnownAsyncApi(node) {
      if (node.callee.type === 'Identifier') {
        const importedName = importedNames.get(node.callee.name);
        return (
          node.callee.name === 'craftSleep' ||
          node.callee.name === 'craftUse' ||
          importedName === 'craftSleep' ||
          importedName === 'craftUse'
        );
      }

      if (
        node.callee.type !== 'MemberExpression' ||
        node.callee.object.type !== 'Identifier'
      ) {
        return false;
      }

      return (
        node.callee.object.name === 'CraftHttpClient' ||
        importedNames.get(node.callee.object.name) === 'CraftHttpClient'
      );
    }

    function isKnownWriteMethod(node) {
      if (node.callee.type !== 'MemberExpression') return false;

      const property = node.callee.computed
        ? node.callee.property.type === 'Literal'
          ? String(node.callee.property.value)
          : undefined
        : node.callee.property.type === 'Identifier'
          ? node.callee.property.name
          : undefined;

      return property ? WRITE_METHODS.has(property) : false;
    }

    function getCalleeType(node) {
      const tsNode = nodeMap.get(node.callee);
      return tsNode ? checker.getTypeAtLocation(tsNode) : undefined;
    }

    function hasBrand(type, brandName, seen = new Set()) {
      if (!type || seen.has(type)) return false;
      seen.add(type);

      if (type.isUnion?.() || type.isIntersection?.()) {
        return type.types.some((part) => hasBrand(part, brandName, seen));
      }

      return checker
        .getPropertiesOfType(type)
        .some((property) => String(property.escapedName).includes(brandName));
    }

    function returnsGenerator(type) {
      if (!type) return false;

      const signatures = type.getCallSignatures?.();
      if (signatures?.length) {
        return signatures.some((signature) =>
          returnsGenerator(signature.getReturnType()),
        );
      }

      const symbol = type.aliasSymbol ?? type.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      if (name === 'Generator' || name === 'YieldableInvocation') {
        return true;
      }

      if (type.isUnion?.()) {
        return type.types.some((part) => returnsGenerator(part));
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

    function returnsPromiseLike(type) {
      if (!type) return false;

      const signatures = type.getCallSignatures?.();
      if (signatures?.length) {
        return signatures.some((signature) =>
          returnsPromiseLike(signature.getReturnType()),
        );
      }

      const symbol = type.aliasSymbol ?? type.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      if (name === 'Promise' || name === 'PromiseLike' || name === 'Thenable') {
        return true;
      }

      if (type.isUnion?.()) {
        return type.types.some((part) => returnsPromiseLike(part));
      }

      return checker
        .getPropertiesOfType(type)
        .some((property) => property.name === 'then');
    }

    function report(node, call) {
      context.report({
        node,
        messageId: 'forbidden',
        data: { call },
      });
    }

    function getCallName(node) {
      if (node.callee.type === 'Identifier') {
        return `${node.callee.name}()`;
      }

      if (node.callee.type === 'MemberExpression') {
        const object = sourceCode.getText(node.callee.object);
        const property = node.callee.computed
          ? sourceCode.getText(node.callee.property)
          : node.callee.property.type === 'Identifier'
            ? node.callee.property.name
            : sourceCode.getText(node.callee.property);
        return `${object}.${property}()`;
      }

      return sourceCode.getText(node.callee);
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      visit(node);

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
