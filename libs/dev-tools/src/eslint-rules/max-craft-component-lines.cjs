const COMPONENT_MODULE = '@craft-ts/component';
const DEFAULT_MAX_LINES = 700;

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Cap the non-import line count of a file that declares a craftComponent; split large components into craftService business logic and craftDirective/craftComponent sub-components.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyLines:
        'This craftComponent file has {{actual}} lines (imports excluded), above the {{max}}-line limit. Move business logic into a craftService and split repeated or independent template regions into craftDirective/craftComponent sub-components.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const max = options.max ?? DEFAULT_MAX_LINES;
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    let componentNode;

    return {
      CallExpression(node) {
        if (componentNode) {
          return;
        }

        if (isCraftComponentCall(node, sourceCode)) {
          componentNode = node;
        }
      },
      'Program:exit'(program) {
        if (!componentNode) {
          return;
        }

        const importLines = new Set();
        for (const statement of program.body) {
          if (statement.type !== 'ImportDeclaration') {
            continue;
          }
          for (
            let line = statement.loc.start.line;
            line <= statement.loc.end.line;
            line += 1
          ) {
            importLines.add(line);
          }
        }

        let countedLines = 0;
        sourceCode.lines.forEach((lineText, index) => {
          const lineNumber = index + 1;
          if (importLines.has(lineNumber)) {
            return;
          }
          if (lineText.trim() === '') {
            return;
          }
          countedLines += 1;
        });

        if (countedLines > max) {
          context.report({
            node: componentNode,
            messageId: 'tooManyLines',
            data: { actual: countedLines, max },
          });
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

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'craftComponent'
  ) {
    return resolvesToNamespaceImport(callee.object, sourceCode, COMPONENT_MODULE);
  }

  return false;
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
