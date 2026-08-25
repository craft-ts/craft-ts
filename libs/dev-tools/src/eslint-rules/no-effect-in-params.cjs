const CORE_PACKAGE = '@craft-ts/core';
const EFFECT_PACKAGE = '@craft-ts/effect';
const EFFECT_RUNTIME_PACKAGE = 'effect';

const PRIMITIVES = new Set([
  'asyncProcess',
  'asyncProcessEffect',
  'mutation',
  'mutationEffect',
  'query',
  'queryEffect',
]);
const SYNCHRONOUS_CALLBACKS = new Set(['craftComputed', 'craftEffect']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep Craft callbacks synchronous by allowing Effect values and Effect service reads only in loaders.',
    },
    schema: [],
    messages: {
      effect:
        'Effect values and Effect service reads are only allowed in an Effect loader. Keep params, methods, craftComputed(...) and craftEffect(...) synchronous, or run a declared-synchronous Effect (SyncOp) through syncEffect(...).',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;
    const keys = sourceCode.visitorKeys ?? {};
    const reportedNodes = new WeakSet();
    const primitiveBindings = new Map();
    const effectBindings = new Set();
    // `syncEffect(...)` is the one sanctioned way through: its argument is an
    // Effect whose `R` carries `SyncOp`, so the type already proved someone
    // declared it synchronous. Reporting it would ban the very API that makes
    // a business calculation reusable from a computation.
    const syncEffectBindings = new Set();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;

        const source = node.source.value;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;

          const imported = getIdentifierName(specifier.imported);
          if (!imported) continue;

          if (
            (source === CORE_PACKAGE || source === EFFECT_PACKAGE) &&
            PRIMITIVES.has(imported)
          ) {
            primitiveBindings.set(specifier.local.name, imported);
          }

          if (source === CORE_PACKAGE && SYNCHRONOUS_CALLBACKS.has(imported)) {
            primitiveBindings.set(specifier.local.name, imported);
          }

          if (source === EFFECT_RUNTIME_PACKAGE && imported === 'Effect') {
            effectBindings.add(specifier.local.name);
          }

          if (source === EFFECT_PACKAGE && imported === 'syncEffect') {
            syncEffectBindings.add(specifier.local.name);
          }
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportNamespaceSpecifier' &&
            source === EFFECT_RUNTIME_PACKAGE
          ) {
            effectBindings.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }

        const primitive = primitiveBindings.get(node.callee.name);
        if (!primitive) return;

        if (SYNCHRONOUS_CALLBACKS.has(primitive)) {
          const factory = [...node.arguments]
            .reverse()
            .find((argument) =>
              ['ArrowFunctionExpression', 'FunctionExpression'].includes(
                unwrap(argument)?.type,
              ),
            );
          if (factory) inspectParams(factory);
          return;
        }

        const config = node.arguments[1];
        if (!config || unwrap(config).type !== 'ObjectExpression') return;

        for (const property of unwrap(config).properties) {
          if (
            property.type === 'Property' &&
            getPropertyName(property.key) !== 'loader'
          ) {
            inspectParams(property.value);
          }
        }
      },
    };

    function inspectParams(node) {
      const expression = unwrap(node);
      if (isEffectExpression(expression)) {
        report(expression);
      }

      walk(
        expression,
        (child) => {
          const isCalledEffectMember =
            child.type === 'MemberExpression' &&
            child.parent?.type === 'CallExpression' &&
            child.parent.callee === child;
          if (
            child !== expression &&
            !isCalledEffectMember &&
            isEffectExpression(child)
          ) {
            report(child);
          }

          if (child.type === 'YieldExpression' && child.delegate) {
            const yielded = unwrap(child.argument);
            if (isEffectService(yielded) || isEffectType(yielded)) {
              report(yielded ?? child);
            }
          }

          if (child.type === 'TSTypeReference' && isEffectTypeSyntax(child)) {
            report(child);
          }

          if (
            child.type === 'ReturnStatement' &&
            child.argument &&
            isEffectType(child.argument)
          ) {
            report(child.argument);
          }
        },
        keys,
      );
    }

    function isEffectExpression(node) {
      if (!node) return false;

      if (
        node.type === 'MemberExpression' &&
        !node.computed &&
        node.object.type === 'Identifier' &&
        effectBindings.has(node.object.name)
      ) {
        return true;
      }

      if (node.type === 'CallExpression' && isEffectExpression(node.callee)) {
        return true;
      }

      return isEffectType(node);
    }

    function isEffectService(node) {
      if (!node || node.type !== 'Identifier') return false;
      if (/Service$/.test(node.name)) return true;

      if (!checker || !nodeMap) return false;
      const type = getType(node);
      const symbol = type?.aliasSymbol ?? type?.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      return Boolean(name && /Service$/.test(name));
    }

    function isEffectType(node) {
      if (!checker || !nodeMap || !node) return false;

      const type = getType(node);
      if (!type) return false;

      const text = checker.typeToString(type);
      if (/\bEffect(?:\.Effect)?\s*</.test(text)) return true;

      const symbol = type.aliasSymbol ?? type.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      return name === 'Effect';
    }

    function isEffectTypeSyntax(node) {
      const typeName = node.typeName;
      if (!typeName) return false;
      if (typeName.type === 'Identifier') return typeName.name === 'Effect';
      return (
        typeName.type === 'TSQualifiedName' &&
        typeName.left.type === 'Identifier' &&
        effectBindings.has(typeName.left.name) &&
        typeName.right.type === 'Identifier' &&
        typeName.right.name === 'Effect'
      );
    }

    function getType(node) {
      const tsNode = nodeMap.get(node);
      return tsNode ? checker.getTypeAtLocation(tsNode) : undefined;
    }

    function isInsideSyncEffectCall(node) {
      for (let current = node?.parent; current; current = current.parent) {
        if (
          current.type === 'CallExpression' &&
          current.callee.type === 'Identifier' &&
          syncEffectBindings.has(current.callee.name)
        ) {
          return true;
        }
        if (
          ['FunctionDeclaration', 'Program'].includes(current.type)
        ) {
          return false;
        }
      }
      return false;
    }

    function report(node) {
      if (!node || reportedNodes.has(node)) return;
      if (isInsideSyncEffectCall(node)) return;
      reportedNodes.add(node);
      context.report({ node, messageId: 'effect' });
    }
  },
};

function walk(node, visit, visitorKeys) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);

  const keys = visitorKeys[node.type] ?? [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => walk(item, visit, visitorKeys));
    } else {
      walk(child, visit, visitorKeys);
    }
  }
}

function getPropertyName(node) {
  if (node.type === 'Identifier') return node.name;
  return node.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    [
      'ChainExpression',
      'TSAsExpression',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}
