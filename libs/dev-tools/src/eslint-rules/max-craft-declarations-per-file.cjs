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

    return {
      CallExpression(node) {
        const kind = getCraftDeclarationKind(node.callee, sourceCode);
        if (!kind) {
          return;
        }

        const kindDeclarations = declarations.get(kind) ?? [];
        kindDeclarations.push(node);
        declarations.set(kind, kindDeclarations);
      },
      'Program:exit'() {
        for (const [kind, kindDeclarations] of declarations) {
          for (const node of kindDeclarations.slice(
            MAX_DECLARATIONS_PER_KIND,
          )) {
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
