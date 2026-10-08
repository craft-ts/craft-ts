const CORE_MODULE = '@craft-ts/core';
const COMPONENT_MODULE = '@craft-ts/component';

// These APIs create Craft nodes or template blocks. Keep this list aligned
// with the node-producing exports from @craft-ts/component.
const TEMPLATE_FACTORIES = new Set([
  'a',
  'article',
  'aside',
  'area',
  'button',
  'caption',
  'catchNode',
  'content',
  'craftTemplate',
  'customElement',
  'deferNode',
  'details',
  'dialog',
  'div',
  'fieldset',
  'fieldErrorNode',
  'figcaption',
  'figure',
  'footer',
  'forNode',
  'form',
  'h',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'heading',
  'headingRoot',
  'headingSection',
  'iframe',
  'ifNode',
  'img',
  'input',
  'label',
  'legend',
  'li',
  'liveRegion',
  'main',
  'matchNode',
  'nav',
  'ol',
  'option',
  'p',
  'pendingNode',
  'pre',
  'renderTemplate',
  'renderContent',
  'section',
  'select',
  'scheduleFor',
  'skipLink',
  'small',
  'span',
  'strong',
  'summary',
  'svg',
  'table',
  'tbody',
  'td',
  'textarea',
  'th',
  'thead',
  'tr',
  'ul',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep Craft template nodes and blocks in craftComponent, not craftService.',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not build template nodes or blocks inside `craftService`. Build the template in `craftComponent` and keep the service focused on state and domain actions.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const reported = new WeakSet();

    return {
      CallExpression(node) {
        if (!isCraftServiceCall(node.callee, sourceCode)) return;
        const factory = node.arguments[1];
        for (const callback of resolveFunctions(factory, sourceCode)) {
          walk(callback.body, (candidate) => {
            for (const reference of templateFactoryReferences(
              candidate,
              sourceCode,
            )) {
              if (reported.has(reference)) continue;
              reported.add(reference);
              context.report({ node: reference, messageId: 'forbidden' });
            }
          });
        }
      },
    };
  },
};

function resolveFunctions(factory, sourceCode) {
  if (isFunction(factory)) return [factory];
  if (factory?.type !== 'Identifier') return [];

  const variable = findVariable(factory, sourceCode);
  const functions = [];
  for (const definition of variable?.defs ?? []) {
    const definedNode = definition.node;
    if (isFunction(definedNode)) {
      functions.push(definedNode);
    } else if (
      definedNode?.type === 'VariableDeclarator' &&
      isFunction(definedNode.init)
    ) {
      functions.push(definedNode.init);
    }
  }
  return functions;
}

function isFunction(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

function isCraftServiceCall(callee, sourceCode) {
  if (callee.type === 'Identifier') {
    return resolvesToImport(callee, sourceCode, 'craftService', CORE_MODULE);
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'craftService' &&
    resolvesToNamespace(callee.object, sourceCode, CORE_MODULE)
  );
}

function templateFactoryReferences(node, sourceCode) {
  if (node.type === 'Identifier') {
    const variable = findVariable(node, sourceCode);
    if (
      !variable?.references.some((reference) => reference.identifier === node)
    ) {
      return [];
    }
    const definition = variable?.defs.find(
      (candidate) => candidate.type === 'ImportBinding',
    );
    const specifier = definition?.node;
    const declaration = definition?.parent;
    if (
      specifier?.type === 'ImportSpecifier' &&
      declaration?.source?.value === COMPONENT_MODULE &&
      TEMPLATE_FACTORIES.has(importedName(specifier))
    ) {
      return [node];
    }
    return [];
  }

  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    resolvesToNamespace(node.object, sourceCode, COMPONENT_MODULE)
  ) {
    const property = staticPropertyName(node);
    return property && TEMPLATE_FACTORIES.has(property) ? [node] : [];
  }

  // `const { button: makeButton } = component;` is another way to reference
  // a factory imported from the component namespace.
  if (
    node.type === 'VariableDeclarator' &&
    node.id.type === 'ObjectPattern' &&
    node.init?.type === 'Identifier' &&
    resolvesToNamespace(node.init, sourceCode, COMPONENT_MODULE)
  ) {
    return node.id.properties.filter((candidate) => {
      const name = staticPropertyName(candidate);
      return name && TEMPLATE_FACTORIES.has(name);
    });
  }

  return [];
}

function staticPropertyName(node) {
  if (node.type === 'Property') {
    return node.computed
      ? node.key.type === 'Literal'
        ? String(node.key.value)
        : undefined
      : node.key.type === 'Identifier'
        ? node.key.name
        : undefined;
  }
  if (node.type !== 'MemberExpression') return undefined;
  return node.computed
    ? node.property.type === 'Literal'
      ? String(node.property.value)
      : undefined
    : node.property.type === 'Identifier'
      ? node.property.name
      : undefined;
}

function resolvesToImport(identifier, sourceCode, imported, module) {
  const variable = findVariable(identifier, sourceCode);
  return variable?.defs.some(
    (definition) =>
      definition.type === 'ImportBinding' &&
      definition.node?.type === 'ImportSpecifier' &&
      importedName(definition.node) === imported &&
      definition.parent?.source?.value === module,
  );
}

function resolvesToNamespace(identifier, sourceCode, module) {
  const variable = findVariable(identifier, sourceCode);
  return variable?.defs.some(
    (definition) =>
      definition.type === 'ImportBinding' &&
      definition.node?.type === 'ImportNamespaceSpecifier' &&
      definition.parent?.source?.value === module,
  );
}

function importedName(specifier) {
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

function findVariable(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.variables.find(
      (candidate) => candidate.name === identifier.name,
    );
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
    else if (child && typeof child.type === 'string') walk(child, visit);
  }
}
