const PRIMITIVES = new Set([
  'asyncProcess',
  'craftPipe',
  'mutation',
  'query',
  'queryParam',
  'queryParams',
  'state',
]);

const ALLOWED_HOSTS = new Set([
  'craftComponent',
  'craftGen',
  'craftRoute',
  'craftRoutes',
  'craftService',
  'toCraftService',
]);

const CORE_IMPORTS = new Set([
  'asyncProcess',
  'craftGen',
  'craftPipe',
  'craftRoute',
  'craftRoutes',
  'craftService',
  'mutation',
  'query',
  'queryParam',
  'queryParams',
  'state',
  'toCraftService',
]);

const COMPONENT_IMPORTS = new Set(['craftComponent']);
const CORE_MODULES = new Set(['@craft-ts/core']);
const COMPONENT_MODULES = new Set(['@craft-ts/component']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Craft primitive creation calls to run inside an Angular-aware Craft host.',
    },
    schema: [],
    messages: {
      primitiveContext:
        "'{{name}}(...)' must be created inside craftComponent, craftService, craftGen, craftRoute, or craftRoutes; module-level primitive creation can fail without an injection context.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.arguments.length === 0 ||
          !PRIMITIVES.has(node.callee.name) ||
          !resolvesToImportedName(
            node.callee,
            sourceCode,
            CORE_IMPORTS,
            CORE_MODULES,
          ) ||
          isInsideAllowedHost(node, sourceCode)
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'primitiveContext',
          data: { name: node.callee.name },
        });
      },
    };
  },
};

function isInsideAllowedHost(node, sourceCode) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      isAllowedHostImport(current.callee, sourceCode)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isAllowedHostImport(identifier, sourceCode) {
  const allowedNames =
    identifier.name === 'craftComponent'
      ? COMPONENT_IMPORTS
      : CORE_IMPORTS;
  const allowedModules =
    identifier.name === 'craftComponent'
      ? COMPONENT_MODULES
      : CORE_MODULES;
  return (
    ALLOWED_HOSTS.has(identifier.name) &&
    resolvesToImportedName(
      identifier,
      sourceCode,
      allowedNames,
      allowedModules,
    )
  );
}

function resolvesToImportedName(
  identifier,
  sourceCode,
  importedNames,
  moduleNames,
) {
  const scope = sourceCode.getScope(identifier);
  let current = scope;

  while (current) {
    const variable = current.variables.find(
      (candidate) => candidate.name === identifier.name,
    );
    if (variable) {
      return variable.defs.some(
        (definition) =>
          definition.type === 'ImportBinding' &&
          importedNames.has(importedName(definition)) &&
          moduleNames.has(definition.parent?.source?.value),
      );
    }
    current = current.upper;
  }

  return false;
}

function importedName(definition) {
  if (definition.node?.type === 'ImportSpecifier') {
    return definition.node.imported.type === 'Identifier'
      ? definition.node.imported.name
      : definition.node.imported.value;
  }

  if (definition.node?.type === 'ImportDefaultSpecifier') {
    return 'default';
  }

  return undefined;
}
