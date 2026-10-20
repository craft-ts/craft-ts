const POINTER_GESTURE_EVENTS = new Set([
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer Craft drag and swipe directives over hand-written pointer gesture tracking.',
    },
    schema: [],
    messages: {
      useCraft:
        'This code tracks a pointer gesture with native events and coordinates. Use `drag` or `swipe` from `@craft-ts/core` for shared pointer handling and semantic replay markers; keep high-frequency preview work presentation-only. No autofix is available because gesture intent and callbacks need a human choice.',
    },
  },
  create(context) {
    const filename = context.getFilename().replaceAll('\\', '/');
    if (filename.endsWith('/libs/core/src/lib/craft-pointer-gestures.ts'))
      return {};

    return {
      'Program:exit'(program) {
        if (!containsGesture(program)) return;
        let reportedNode;
        visit(program, (node) => {
          if (reportedNode || node.type !== 'CallExpression') return;
          if (
            node.callee.type === 'MemberExpression' &&
            !node.callee.computed &&
            node.callee.property.type === 'Identifier' &&
            ['addEventListener', 'listen'].includes(
              node.callee.property.name,
            ) &&
            node.arguments.some(
              (argument) =>
                argument.type === 'Literal' &&
                POINTER_GESTURE_EVENTS.has(argument.value),
            )
          )
            reportedNode = node;
        });
        if (reportedNode)
          context.report({ node: reportedNode, messageId: 'useCraft' });
      },
    };
  },
};

function containsGesture(root) {
  const events = new Set();
  let hasCoordinates = false;
  let hasPointerTracking = false;
  visit(root, (node) => {
    if (node.type === 'Literal' && POINTER_GESTURE_EVENTS.has(node.value))
      events.add(node.value);
    if (
      node.type === 'Identifier' &&
      ['clientX', 'clientY', 'setPointerCapture'].includes(node.name)
    )
      hasCoordinates = true;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.type === 'Identifier' &&
      ['addEventListener', 'listen'].includes(node.callee.property.name)
    )
      hasPointerTracking = true;
  });
  return (
    hasPointerTracking &&
    hasCoordinates &&
    events.has('pointerdown') &&
    (events.has('pointermove') || events.has('pointerup')) &&
    (events.has('pointerup') || events.has('pointercancel'))
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
