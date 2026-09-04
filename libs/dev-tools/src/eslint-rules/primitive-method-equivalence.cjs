/**
 * Tracks exposed primitive methods through the small amount of aliasing that
 * component setup/template code is allowed to use. This deliberately follows
 * references only: wrapping a method in a new function is a different method
 * and is outside this equivalence relation.
 */
function collectPrimitiveMethodUsages(program, primitiveBindings, sourceCode) {
  const primitiveVariables = collectPrimitiveVariables(
    program,
    primitiveBindings,
    sourceCode,
  );
  const methodAliases = new Map();
  const setupReturnProperties = new Set();
  const templateParameterBindings = new Set();
  const componentContextProperties = new Map();

  // Context bindings can depend on local aliases, while local aliases can in
  // turn depend on template context bindings. Iterate to a fixed point so the
  // order of declarations does not affect the result.
  let changed = true;
  while (changed) {
    changed = false;

    walk(program, (node) => {
      if (node.type !== 'VariableDeclarator') return;

      if (node.id.type === 'Identifier') {
        const variable = getVariable(sourceCode, node.id);
        const target = getMethodTarget(
          node.init,
          primitiveBindings,
          primitiveVariables,
          methodAliases,
          sourceCode,
        );
        if (
          target &&
          variable &&
          !sameTarget(methodAliases.get(variable), target)
        ) {
          methodAliases.set(variable, target);
          changed = true;
        }
      }
    });

    walk(program, (node) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        node.callee.name !== 'craftComponent'
      ) {
        return;
      }

      const setup = node.arguments[2];
      const template = node.arguments[3];
      if (!isFunction(setup) || !isFunction(template)) return;

      for (const returned of getReturnedObjects(setup)) {
        for (const property of returned.properties) {
          if (
            property.type !== 'Property' ||
            property.computed ||
            property.value.type === 'AssignmentPattern'
          ) {
            continue;
          }
          const name = getPropertyName(property.key);
          const target = getMethodTarget(
            property.value,
            primitiveBindings,
            primitiveVariables,
            methodAliases,
            sourceCode,
          );
          if (!name || !target) continue;
          setupReturnProperties.add(property);
          if (!sameTarget(componentContextProperties.get(name), target)) {
            componentContextProperties.set(name, target);
            changed = true;
          }
        }
      }

      const parameter = template.params[0];
      if (parameter?.type !== 'ObjectPattern') return;
      for (const property of parameter.properties) {
        if (
          property.type !== 'Property' ||
          property.computed ||
          property.value.type !== 'Identifier'
        ) {
          continue;
        }
        const name = getPropertyName(property.key);
        const target = name ? componentContextProperties.get(name) : undefined;
        if (!name || !target) continue;
        templateParameterBindings.add(property.value);
        const variable = getVariable(sourceCode, property.value);
        if (variable && !sameTarget(methodAliases.get(variable), target)) {
          methodAliases.set(variable, target);
          changed = true;
        }
      }
    });
  }

  const usages = new Map();
  walk(program, (node) => {
    if (node.type === 'MemberExpression') {
      const target = getMethodTarget(
        node,
        primitiveBindings,
        primitiveVariables,
        methodAliases,
        sourceCode,
      );
      if (!target || isReferencePropagation(node, setupReturnProperties)) {
        return;
      }
      addUsage(usages, target, node);
      return;
    }

    if (node.type !== 'Identifier') return;
    const target = methodAliases.get(getVariable(sourceCode, node));
    if (
      !target ||
      isNonUsageIdentifier(
        node,
        setupReturnProperties,
        templateParameterBindings,
      )
    ) {
      return;
    }
    addUsage(usages, target, node);
  });

  return usages;
}

function getMethodTarget(
  node,
  primitiveBindings,
  primitiveVariables,
  methodAliases,
  sourceCode,
) {
  const current = unwrap(node);
  if (!current) return undefined;

  if (current.type === 'Identifier') {
    return methodAliases.get(getVariable(sourceCode, current));
  }

  if (current.type !== 'MemberExpression') return undefined;
  if (current.object.type !== 'Identifier') return undefined;

  const binding =
    primitiveVariables.get(getVariable(sourceCode, current.object)) ??
    primitiveBindings.get(current.object.name);
  if (!binding) return undefined;
  const method = getPropertyName(current.property);
  if (!method || !binding.methods.has(method)) return undefined;
  return { binding, method };
}

function addUsage(usages, target, node) {
  const key = `${target.binding.id}:${target.method}`;
  const sites = usages.get(key) ?? [];
  sites.push({ node, binding: target.binding, method: target.method });
  usages.set(key, sites);
}

function collectPrimitiveVariables(program, primitiveBindings, sourceCode) {
  const variables = new Map();
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator') return;

    if (node.id.type === 'Identifier') {
      const binding =
        primitiveBindings.get(node.id.name) ??
        (node.init?.type === 'Identifier'
          ? primitiveBindings.get(node.init.name)
          : undefined);
      const variable = getVariable(sourceCode, node.id);
      if (binding && variable) variables.set(variable, binding);
      return;
    }

    if (node.id.type !== 'ObjectPattern') return;
    for (const property of node.id.properties) {
      if (
        property.type !== 'Property' ||
        property.computed ||
        property.value.type !== 'Identifier'
      ) {
        continue;
      }
      const binding = primitiveBindings.get(property.value.name);
      const variable = getVariable(sourceCode, property.value);
      if (binding && variable) variables.set(variable, binding);
    }
  });
  return variables;
}

function getVariable(sourceCode, identifier) {
  if (!sourceCode || identifier?.type !== 'Identifier') return undefined;
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

function isReferencePropagation(node, setupReturnProperties) {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === 'VariableDeclarator' && parent.init === node) return true;
  return (
    parent.type === 'Property' &&
    parent.value === node &&
    setupReturnProperties.has(parent)
  );
}

function isNonUsageIdentifier(
  node,
  setupReturnProperties,
  templateParameterBindings,
) {
  const parent = node.parent;
  if (!parent) return false;
  if (templateParameterBindings.has(node)) return true;
  if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
  if (
    parent.type === 'Property' &&
    parent.key === node &&
    parent.value !== node
  ) {
    return true;
  }
  if (
    parent.type === 'Property' &&
    parent.value === node &&
    setupReturnProperties.has(parent)
  ) {
    return true;
  }
  if (
    parent.type === 'MemberExpression' &&
    parent.property === node &&
    !parent.computed
  ) {
    return true;
  }
  // `const next = current` is another unchanged reference, not a call site.
  if (parent.type === 'VariableDeclarator' && parent.init === node) return true;
  return false;
}

function getReturnedObjects(node) {
  const body = unwrap(node.body);
  if (body?.type === 'ObjectExpression') return [body];
  if (body?.type !== 'BlockStatement') return [];
  return body.body
    .filter((statement) => statement.type === 'ReturnStatement')
    .map((statement) => unwrap(statement.argument))
    .filter((value) => value?.type === 'ObjectExpression');
}

function sameTarget(left, right) {
  return Boolean(
    left &&
      right &&
      left.binding.id === right.binding.id &&
      left.method === right.method,
  );
}

function walk(node, visit) {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, visit);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  );
}

function unwrap(node) {
  let current = node;
  while (
    current?.type === 'ChainExpression' ||
    current?.type === 'TSAsExpression'
  ) {
    current = current.expression;
  }
  return current;
}

function getPropertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  return undefined;
}

module.exports = { collectPrimitiveMethodUsages };
