const {
  isCraftPrivateCall,
  isServiceExposure,
  isServiceFactory,
  isStringLiteral,
  primitiveName,
  stringValue,
  unwrap,
} = require('./craft-service-exposure-utils.cjs');

function isCraftExpose(call) {
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    call.callee.name === 'craftExpose'
  );
}

function enclosingServiceFactory(node) {
  let current = node.parent;
  while (current) {
    if (isFunction(current) && isServiceFactory(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function findVariable(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

function publicUtility(declarator) {
  const init = unwrap(declarator?.init);
  if (init?.type !== 'YieldExpression' || !init.delegate) return undefined;
  const call = unwrap(init.argument);
  if (call?.type !== 'CallExpression' || isCraftPrivateCall(call))
    return undefined;
  if (!isServiceExposure(call)) return undefined;
  const name = primitiveName(call);
  return name === undefined ? undefined : { call, name };
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid exposing a named utility from a craftService again through a local binding.',
      url: 'https://craft-ts.github.io/craft/guide/routing/eslint-rules#do-not-reexpose-a-craft-service-utility',
    },
    schema: [],
    messages: {
      reexposed:
        '"{{local}}" is already exposed by {{utility}}("{{name}}"). Remove this craftExpose; use the existing service key instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isCraftExpose(node) || node.arguments.length < 2) return;
        const factory = enclosingServiceFactory(node);
        if (!factory) return;

        const [keyNode, valueNode] = node.arguments;
        if (!isStringLiteral(keyNode)) return;
        const key = stringValue(keyNode);
        const value = unwrap(valueNode);
        if (value?.type !== 'Identifier') return;

        const variable = findVariable(value, sourceCode);
        const definition = variable?.defs.find(
          (candidate) => candidate.type === 'Variable',
        )?.node;
        if (definition?.type !== 'VariableDeclarator')
          return;

        const utility = publicUtility(definition);
        if (!utility || key === utility.name) return;

        const callName = utility.call.callee;
        const utilityName =
          callName.type === 'Identifier'
            ? callName.name
            : callName.type === 'MemberExpression' &&
                callName.property.type === 'Identifier'
              ? callName.property.name
              : 'utility';

        context.report({
          node,
          messageId: 'reexposed',
          data: {
            local: value.name,
            utility: utilityName,
            name: utility.name,
          },
        });
      },
    };
  },
};
