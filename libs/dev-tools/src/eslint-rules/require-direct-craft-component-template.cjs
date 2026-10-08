const COMPONENT_MODULE = '@craft-ts/component';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require craftComponent to receive a concise lambda that directly returns its template.',
    },
    schema: [],
    messages: {
      direct:
        'Pass craftComponent a concise arrow function that directly returns a template call or node array; move setup and derived values out of the template.',
      destructuredInput:
        'Do not destructure craftComponent lambda parameters; use named inputs directly in the returned template.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isCraftComponentCall(node, sourceCode)) return;

        const template = node.arguments[2];
        if (template?.type !== 'ArrowFunctionExpression') {
          context.report({ node: template ?? node, messageId: 'direct' });
          return;
        }

        if (template.body.type === 'BlockStatement') {
          context.report({ node: template, messageId: 'direct' });
        } else if (
          template.body.type !== 'CallExpression' &&
          template.body.type !== 'ArrayExpression'
        ) {
          context.report({ node: template.body, messageId: 'direct' });
        }

        for (const parameter of template.params) {
          if (parameter.type === 'ObjectPattern' || parameter.type === 'ArrayPattern') {
            context.report({ node: parameter, messageId: 'destructuredInput' });
          }
        }

        if (template.async || template.generator) {
          context.report({ node: template, messageId: 'direct' });
        }
      },
    };
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
        isComponentModule(definition.parent?.source?.value, module),
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
        isComponentModule(definition.parent?.source?.value, module),
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

function isComponentModule(source, packageName) {
  return (
    source === packageName ||
    (typeof source === 'string' && source.startsWith('.'))
  );
}
