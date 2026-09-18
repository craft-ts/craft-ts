const CORE_MODULE = '@craft-ts/core';
const COMPONENT_MODULE = '@craft-ts/component';
const MAX_DECLARATIONS_PER_KIND = 2;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Limit each kind of Craft component, service, or directive to two declarations per file.',
    },
    schema: [],
    messages: {
      tooMany:
        'Do not declare more than two {{kind}} in the same file. Move the additional Craft entity to its own file.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const declarations = new Map();
    const componentProvided = new Set();

    return {
      CallExpression(node) {
        const kind = getCraftDeclarationKind(node.callee, sourceCode);
        if (!kind) {
          return;
        }

        if (kind === 'craft components') {
          collectProvidedServices(node, componentProvided);
        }

        const kindDeclarations = declarations.get(kind) ?? [];
        kindDeclarations.push(node);
        declarations.set(kind, kindDeclarations);
      },
      'Program:exit'() {
        for (const [kind, kindDeclarations] of declarations) {
          // A component's own service is part of that component, not a second
          // thing living in the file: it is declared here because the component
          // provides it here.
          const counted =
            kind === 'craft services'
              ? kindDeclarations.filter(
                  (node) => !componentProvided.has(serviceName(node)),
                )
              : kindDeclarations;

          for (const node of counted.slice(MAX_DECLARATIONS_PER_KIND)) {
            context.report({
              node,
              messageId: 'tooMany',
              data: { kind },
            });
          }
        }
      },
    };
  },
};

/** The `name` a craftService(...) call declares, when it is a literal. */
function serviceName(node) {
  const options = node.arguments?.[0];
  if (options?.type !== 'ObjectExpression') return undefined;
  const property = options.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      !candidate.computed &&
      candidate.key.type === 'Identifier' &&
      candidate.key.name === 'name' &&
      candidate.value.type === 'Literal',
  );
  return property?.value.value;
}

/** Service names a craftComponent(...) provides through its own meta. */
function collectProvidedServices(node, names) {
  const meta = node.arguments?.[1];
  if (meta?.type !== 'ObjectExpression') return;
  const providers = meta.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      !candidate.computed &&
      candidate.key.type === 'Identifier' &&
      candidate.key.name === 'providers',
  );
  if (providers?.value?.type !== 'ArrayExpression') return;

  for (const element of providers.value.elements) {
    if (
      element?.type === 'CallExpression' &&
      element.callee.type === 'Identifier' &&
      element.callee.name.startsWith('provide')
    ) {
      const provided = element.callee.name.slice('provide'.length);
      names.add(provided.charAt(0).toLowerCase() + provided.slice(1));
      names.add(provided);
    }
  }
}

function getCraftDeclarationKind(callee, sourceCode) {
  if (callee.type === 'Identifier') {
    if (
      resolvesToImportedName(
        callee,
        sourceCode,
        'craftComponent',
        COMPONENT_MODULE,
      )
    ) {
      return 'craft components';
    }

    if (
      resolvesToImportedName(
        callee,
        sourceCode,
        'craftDirective',
        COMPONENT_MODULE,
      )
    ) {
      return 'craft directives';
    }

    if (
      resolvesToImportedName(callee, sourceCode, 'craftService', CORE_MODULE)
    ) {
      return 'craft services';
    }

    return undefined;
  }

  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.object.type !== 'Identifier' ||
    callee.property.type !== 'Identifier'
  ) {
    return undefined;
  }

  if (
    callee.property.name === 'craftComponent' &&
    resolvesToNamespaceImport(callee.object, sourceCode, COMPONENT_MODULE)
  ) {
    return 'craft components';
  }

  if (
    callee.property.name === 'craftDirective' &&
    resolvesToNamespaceImport(callee.object, sourceCode, COMPONENT_MODULE)
  ) {
    return 'craft directives';
  }

  if (
    callee.property.name === 'craftService' &&
    resolvesToNamespaceImport(callee.object, sourceCode, CORE_MODULE)
  ) {
    return 'craft services';
  }

  return undefined;
}

function resolvesToImportedName(identifier, sourceCode, importedName, module) {
  const variable = findVariable(identifier, sourceCode);
  return variable?.defs.some(
    (definition) =>
      definition.type === 'ImportBinding' &&
      definition.node?.type === 'ImportSpecifier' &&
      getImportedName(definition.node) === importedName &&
      definition.parent?.source?.value === module,
  );
}

function resolvesToNamespaceImport(identifier, sourceCode, module) {
  const variable = findVariable(identifier, sourceCode);
  return variable?.defs.some(
    (definition) =>
      definition.type === 'ImportBinding' &&
      definition.node?.type === 'ImportNamespaceSpecifier' &&
      definition.parent?.source?.value === module,
  );
}

function findVariable(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);

  while (scope) {
    const variable = scope.variables.find(
      (candidate) => candidate.name === identifier.name,
    );
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }

  return undefined;
}

function getImportedName(specifier) {
  if (specifier.imported.type === 'Identifier') {
    return specifier.imported.name;
  }

  return specifier.imported.value;
}
