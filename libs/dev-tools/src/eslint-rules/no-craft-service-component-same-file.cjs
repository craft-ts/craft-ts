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

    return {
      CallExpression(node) {
        const kind = getCraftHostKind(node.callee, sourceCode);
        if (kind) {
          calls.push({ kind, node });
        }
      },
      'Program:exit'() {
        const hasService = calls.some(({ kind }) => kind === 'service');
        const hasComponent = calls.some(({ kind }) => kind === 'component');

        if (!hasService || !hasComponent) {
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
