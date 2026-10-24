const GESTURE_EVENTS = new Set([
  'change',
  'click',
  'contextmenu',
  'dblclick',
  'input',
  'keydown',
  'keyup',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'pointercancel',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerup',
  'scroll',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a semantic replay trigger when native gesture listeners invoke Craft work.',
    },
    schema: [],
    messages: {
      wrap: 'This native {{event}} listener contains Craft work that invocation replay cannot associate with a gesture. Wrap the semantic handler in `runCraftReplayTrigger(...)`, or bind the action through a Craft template event.',
    },
  },
  create(context) {
    const replayTriggerNames = new Set(['runCraftReplayTrigger']);
    let reported = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.name === 'runCraftReplayTrigger'
          )
            replayTriggerNames.add(specifier.local.name);
        }
      },
      'Program:exit'(program) {
        const functions = collectFunctions(program);
        visit(program, (node) => {
          if (node.type !== 'CallExpression') return;
          const listener = getListener(node);
          if (!listener || !GESTURE_EVENTS.has(listener.event)) return;
          const handler = resolveHandler(listener.handler, functions);
          if (!handler || !containsCraftWork(handler)) return;
          if (containsReplayTrigger(handler, replayTriggerNames)) return;
          if (reported.has(node)) return;
          reported.add(node);
          context.report({
            node,
            messageId: 'wrap',
            data: { event: listener.event },
          });
        });
      },
    };
  },
};

function getListener(node) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined;
  const method = callee.property.name;
  if (method === 'addEventListener') {
    const event = stringValue(node.arguments[0]);
    const handler = node.arguments[1];
    return event && handler ? { event, handler } : undefined;
  }
  if (method === 'listen') {
    const event = stringValue(node.arguments[1]);
    const handler = node.arguments[2];
    return event && handler ? { event, handler } : undefined;
  }
  return undefined;
}

function stringValue(node) {
  return node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function collectFunctions(root) {
  const functions = new Map();
  visit(root, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier')
      functions.set(node.id.name, node);
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier')
      return;
    if (isFunction(node.init)) functions.set(node.id.name, node.init);
  });
  return functions;
}

function resolveHandler(node, functions) {
  if (isFunction(node)) return node;
  if (node.type === 'Identifier') return functions.get(node.name);
  return undefined;
}

function containsCraftWork(root) {
  let found = false;
  visit(root, (node) => {
    if (
      node.type === 'YieldExpression' ||
      (node.type === 'CallExpression' && callName(node) === 'executeYieldable')
    )
      found = true;
  });
  return found;
}

function containsReplayTrigger(root, names) {
  let found = false;
  visit(root, (node) => {
    if (node.type === 'CallExpression' && names.has(callName(node)))
      found = true;
  });
  return found;
}

function callName(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  )
    return callee.property.name;
  return undefined;
}

function isFunction(node) {
  return (
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, callback);
    } else if (value && typeof value === 'object') {
      visit(value, callback);
    }
  }
}
