const PRIMITIVE_CALLS = new Set([
  'asyncProcess',
  'craftPipe',
  'mutation',
  'query',
  'queryParams',
  'state',
]);

/**
 * Angular computed() remains valid while configuring a Craft primitive. Those
 * computations are part of the primitive's tracked graph, not component
 * orchestration logic.
 */
function isInsideCraftPrimitive(node) {
  let current = node.parent;

  while (current) {
    if (
      current.type === 'CallExpression' &&
      isPrimitiveCallee(current.callee)
    ) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function isPrimitiveCallee(callee) {
  if (callee.type === 'Identifier') {
    return PRIMITIVE_CALLS.has(callee.name) || callee.name.startsWith('insert');
  }

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    (PRIMITIVE_CALLS.has(callee.property.name) ||
      callee.property.name.startsWith('insert'))
  );
}

module.exports = { isInsideCraftPrimitive };
