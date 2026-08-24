function report(context, node, message) {
  context.report({ node, message });
}

function propertyName(node) {
  if (!node) return undefined;
  if (!node.computed && node.property && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.computed && node.property && node.property.type === 'Literal') {
    return String(node.property.value);
  }
  return undefined;
}

function isCallNamed(node, name) {
  return node && node.type === 'CallExpression' &&
    node.callee && node.callee.type === 'Identifier' && node.callee.name === name;
}

module.exports = { report, propertyName, isCallNamed };
