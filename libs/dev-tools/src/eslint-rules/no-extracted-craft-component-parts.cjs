const COMPONENT_MODULE = '@craft-ts/component';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require craftComponent logic factories and templates to remain inline.',
    },
    schema: [],
    messages: {
      logic:
        'Keep the craftComponent logic factory inline; do not extract it into "{{name}}".',
      template:
        'Keep the craftComponent template inline; do not extract it into "{{name}}".',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isCraftComponentCall(node, sourceCode)) return;

        reportIdentifier(node.arguments[2], 'logic');
        reportIdentifier(node.arguments[3], 'template');
      },
    };

    function reportIdentifier(argument, messageId) {
      if (argument?.type !== 'Identifier') return;

      context.report({
        node: argument,
        messageId,
        data: { name: argument.name },
      });
    }
  },
};

function isCraftComponentCall(node, sourceCode) {
  const callee = node.callee;

  if (callee.type === 'Identifier') {
    return resolvesToImportedName(
      callee,
      sourceCode,
      'craftComponent',
      COMPONENT_MODULE,
    );
  }

  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'craftComponent' &&
    resolvesToNamespaceImport(callee.object, sourceCode, COMPONENT_MODULE)
  );
}

function resolvesToImportedName(identifier, sourceCode, importedName, module) {
  const variable = findVariable(identifier, sourceCode);
  return Boolean(
    variable?.defs.some(
      (definition) =>
        definition.type === 'ImportBinding' &&
        definition.node?.type === 'ImportSpecifier' &&
        getImportedName(definition.node) === importedName &&
        definition.parent?.source?.value === module,
    ),
  );
}

function resolvesToNamespaceImport(identifier, sourceCode, module) {
  const variable = findVariable(identifier, sourceCode);
  return Boolean(
    variable?.defs.some(
      (definition) =>
        definition.type === 'ImportBinding' &&
        definition.node?.type === 'ImportNamespaceSpecifier' &&
        definition.parent?.source?.value === module,
    ),
  );
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

function getImportedName(specifier) {
  if (specifier.imported.type === 'Identifier') {
    return specifier.imported.name;
  }

  return specifier.imported.value;
}
