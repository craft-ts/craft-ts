const CORE_MODULE = '@craft-ts/core';
const COMPONENT_MODULE = '@craft-ts/component';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow declaring craftService and craftComponent in the same file so route-level providers do not break lazy loading.',
    },
    schema: [],
    messages: {
      separateFiles:
        'Do not declare craftService and craftComponent in the same file. If the service is provided at route level while the component is lazy-loaded, co-location breaks lazy loading; keep them in separate files.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const calls = [];
    const componentProvided = new Set();

    return {
      CallExpression(node) {
        const kind = getCraftHostKind(node.callee, sourceCode);
        if (kind) {
          calls.push({ kind, node, name: serviceName(node, kind) });
          if (kind === 'component') {
            collectProvidedServices(node, componentProvided);
          }
        }
      },
      'Program:exit'() {
        // A component's own service is the component: it is declared beside it
        // and provided by it, so it travels with the lazy chunk. What still
        // breaks a lazy load is a service left here for someone *else* — a
        // route — to provide.
        const strayServices = calls.filter(
          ({ kind, name }) =>
            kind === 'service' && (!name || !componentProvided.has(name)),
        );
        const hasComponent = calls.some(({ kind }) => kind === 'component');

        if (strayServices.length === 0 || !hasComponent) {
          return;
        }

        for (const { node } of calls) {
          context.report({
            node,
            messageId: 'separateFiles',
          });
        }
      },
    };
  },
};

/** The `name` a craftService(...) call declares, when it is a literal. */
function serviceName(node, kind) {
  if (kind !== 'service') return undefined;
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

function getCraftHostKind(callee, sourceCode) {
  if (callee.type === 'Identifier') {
    if (
      resolvesToImportedName(callee, sourceCode, 'craftService', CORE_MODULE)
    ) {
      return 'service';
    }

    if (
      resolvesToImportedName(
        callee,
        sourceCode,
        'craftComponent',
        COMPONENT_MODULE,
      )
    ) {
      return 'component';
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
    callee.property.name === 'craftService' &&
    resolvesToNamespaceImport(callee.object, sourceCode, CORE_MODULE)
  ) {
    return 'service';
  }

  if (
    callee.property.name === 'craftComponent' &&
    resolvesToNamespaceImport(callee.object, sourceCode, COMPONENT_MODULE)
  ) {
    return 'component';
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
