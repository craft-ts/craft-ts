const COMPONENT_MODULE = '@craft-ts/component';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Read yielded service values where the component template uses them.',
    },
    schema: [],
    messages: {
      readAtUse:
        'Do not bind a yielded service value in the craftComponent factory. Read it inside the template binding that uses it.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const componentNames = new Set();
    const componentNamespaces = new Set();
    const serviceBindings = new Map();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== COMPONENT_MODULE) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            importedName(specifier.imported) === 'craftComponent'
          ) {
            componentNames.add(specifier.local.name);
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            componentNamespaces.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        const declaration = node.parent;
        if (declaration?.kind !== 'const') return;
        const factory = componentFactoryFor(node, sourceCode, isCraftComponent);
        if (!factory) return;

        let bindings = serviceBindings.get(factory);
        if (!bindings) {
          bindings = new Set();
          serviceBindings.set(factory, bindings);
        }

        const yieldedService = containsYieldedCall(node.init, sourceCode);
        const aliasesServiceValue = referencesServiceBinding(
          node.init,
          bindings,
          sourceCode,
        );

        if (!yieldedService && !aliasesServiceValue) return;
        context.report({ node, messageId: 'readAtUse' });
        for (const name of bindingNames(node.id)) bindings.add(name);
      },
    };

    function isCraftComponent(node) {
      if (node?.type !== 'CallExpression') return false;
      const callee = node.callee;
      if (callee.type === 'Identifier') return componentNames.has(callee.name);
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        componentNamespaces.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'craftComponent'
      );
    }
  },
};

function componentFactoryFor(node, sourceCode, isCraftComponent) {
  const ancestors = sourceCode.getAncestors(node);
  const nearestFunction = [...ancestors]
    .reverse()
    .find((ancestor) => isFunction(ancestor));
  if (!nearestFunction) return undefined;

  const componentCall = [...ancestors]
    .reverse()
    .find(
      (ancestor) =>
        isCraftComponent(ancestor) &&
        ancestor.arguments[2] === nearestFunction,
    );
  return componentCall ? nearestFunction : undefined;
}

function isFunction(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function bindingNames(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'RestElement') return bindingNames(pattern.argument);
  if (pattern.type === 'AssignmentPattern') return bindingNames(pattern.left);
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(bindingNames);
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.flatMap((property) =>
      property.type === 'RestElement'
        ? bindingNames(property.argument)
        : bindingNames(property.value),
    );
  }
  return [];
}

function containsYieldedCall(node, sourceCode) {
  if (!node || typeof node.type !== 'string') return false;
  if (isFunction(node)) return false;
  if (
    node.type === 'YieldExpression' &&
    node.delegate &&
    node.argument?.type === 'CallExpression'
  ) {
    return true;
  }

  const keys = sourceCode.visitorKeys[node.type] ?? [];
  return keys.some((key) => {
    const child = node[key];
    return Array.isArray(child)
      ? child.some((item) => containsYieldedCall(item, sourceCode))
      : containsYieldedCall(child, sourceCode);
  });
}

function referencesServiceBinding(node, bindings, sourceCode) {
  if (!node || typeof node.type !== 'string') return false;
  if (isFunction(node)) return false;
  if (node.type === 'Identifier' && bindings.has(node.name)) {
    const parent = node.parent;
    const isNonComputedProperty =
      (parent?.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed) ||
      (parent?.type === 'Property' &&
        parent.key === node &&
        !parent.computed &&
        !parent.shorthand);
    if (!isNonComputedProperty) return true;
  }

  const keys = sourceCode.visitorKeys[node.type] ?? [];
  return keys.some((key) => {
    const child = node[key];
    return Array.isArray(child)
      ? child.some((item) => referencesServiceBinding(item, bindings, sourceCode))
      : referencesServiceBinding(child, bindings, sourceCode);
  });
}

function importedName(node) {
  return node.type === 'Identifier' ? node.name : node.value;
}
