const EVENT_METHODS = new Set([
  'preventDefault',
  'stopPropagation',
  'stopImmediatePropagation',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow craftMethod wrappers that only modify a DOM event and delegate to one action.',
    },
    schema: [],
    messages: {
      wrapper:
        'This craftMethod only modifies the DOM event and calls another action. Bind that action and its modifiers with eventAction(...) on the element instead.',
    },
  },
  create(context) {
    const methodNames = new Set(['craftMethod']);
    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.name === 'craftMethod'
          ) {
            methodNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !methodNames.has(node.callee.name)
        ) {
          return;
        }
        const callback = [...node.arguments].reverse().find(isFunction);
        if (!callback || callback.body.type !== 'BlockStatement') return;
        const eventName = callback.params[0]?.name;
        if (!eventName || callback.params[0].type !== 'Identifier') return;
        const statements = callback.body.body;
        if (statements.length < 2) return;
        if (
          !statements
            .slice(0, -1)
            .every((statement) => isModifier(statement, eventName))
        ) {
          return;
        }
        if (!isDelegate(statements.at(-1), eventName)) return;
        context.report({ node, messageId: 'wrapper' });
      },
    };
  },
};

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function unwrap(node) {
  return node?.type === 'ChainExpression' ? node.expression : node;
}

function isModifier(statement, eventName) {
  if (statement.type !== 'ExpressionStatement') return false;
  const call = unwrap(statement.expression);
  const member = unwrap(call?.callee);
  return (
    call?.type === 'CallExpression' &&
    call.arguments.length === 0 &&
    member?.type === 'MemberExpression' &&
    !member.computed &&
    member.object.type === 'Identifier' &&
    member.object.name === eventName &&
    member.property.type === 'Identifier' &&
    EVENT_METHODS.has(member.property.name)
  );
}

function isDelegate(statement, eventName) {
  if (!statement) return false;
  let expression;
  if (statement.type === 'ExpressionStatement')
    expression = statement.expression;
  else if (statement.type === 'ReturnStatement')
    expression = statement.argument;
  else return false;
  if (expression?.type === 'YieldExpression') expression = expression.argument;
  const call = unwrap(expression);
  if (
    call?.type !== 'CallExpression' ||
    !isForwardingArguments(call.arguments, eventName)
  )
    return false;
  const callee = unwrap(call.callee);
  return (
    (callee.type === 'Identifier' || callee.type === 'MemberExpression') &&
    !containsIdentifier(callee, eventName)
  );
}

function isForwardingArguments(args, eventName) {
  return (
    args.length === 0 ||
    (args.length === 1 &&
      args[0].type === 'Identifier' &&
      args[0].name === eventName)
  );
}

function containsIdentifier(node, name) {
  if (node.type === 'Identifier') return node.name === name;
  if (node.type === 'MemberExpression') {
    return (
      containsIdentifier(node.object, name) ||
      (node.computed && containsIdentifier(node.property, name))
    );
  }
  return false;
}
