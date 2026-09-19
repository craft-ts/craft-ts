/**
 * A component is one function: it declares what it takes, then returns what it
 * renders. Rules about *rendering* must look at the second half only — a type
 * assertion on a state's initial value, or a method declared in an insertion,
 * is a declaration, not a template binding.
 */

function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

/** The expressions a component renders: what its function returns. */
function templateRegions(template) {
  if (!template) return [];
  if (!isFunctionNode(template)) return [template];
  const body = template.body;
  if (!body) return [];
  if (body.type !== 'BlockStatement') return [body];

  const returned = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node !== body && isFunctionNode(node)) return;
    if (node.type === 'ReturnStatement') {
      if (node.argument) returned.push(node.argument);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(body);
  return returned;
}

module.exports = { isFunctionNode, templateRegions };
