const START_EVENTS = new Set(['pointerdown', 'touchstart']);
const END_EVENTS = new Set([
  'pointerup',
  'pointercancel',
  'pointerleave',
  'touchend',
  'touchcancel',
]);
const TIMER_CALLS = new Set(['setTimeout', 'schedule']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer Craft’s replay-aware longPress directive over hand-written pointer hold timers.',
    },
    schema: [],
    messages: {
      useCraft:
        'This code implements a press-and-hold gesture with native pointer or touch events and a timer. Use `longPress` from `@craft-ts/core` for shared cancellation, click suppression, and replay behavior. For a different semantic gesture, wrap its handler with `runCraftReplayTrigger`.',
    },
  },
  create(context) {
    const filename = context.getFilename().replaceAll('\\', '/');
    if (filename.endsWith('/libs/core/src/lib/craft-long-press.ts')) return {};

    let reported = false;

    return {
      'Program:exit'(program) {
        visit(program, (node) => {
          if (reported || !isFunction(node) || !containsPattern(node)) return;
          reported = true;
          context.report({ node, messageId: 'useCraft' });
        });
      },
    };
  },
};

function isFunction(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function containsPattern(root) {
  const eventNames = new Set();
  let hasTimer = false;
  visit(root, (node) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (START_EVENTS.has(node.value) || END_EVENTS.has(node.value))
        eventNames.add(node.value);
    }
    if (node.type !== 'CallExpression') return;
    const callee = node.callee;
    const name =
      callee.type === 'Identifier'
        ? callee.name
        : callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.property.type === 'Identifier'
          ? callee.property.name
          : undefined;
    if (name && TIMER_CALLS.has(name)) hasTimer = true;
  });
  return (
    hasTimer &&
    [...eventNames].some((eventName) => START_EVENTS.has(eventName)) &&
    [...eventNames].some((eventName) => END_EVENTS.has(eventName))
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
