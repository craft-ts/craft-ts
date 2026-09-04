const CORE_MODULE = '@craft-ts/core';
const CRAFT_EXCEPTION_NAME = 'craftException';
const DEFAULT_EXCEPTION_CODE = 'UNEXPECTED_ERROR';

module.exports = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Require Craft’s typed exception channel instead of throw statements that bypass resource exception state; keep technical throws inside explicit adapter boundaries.',
    },
    schema: [],
    messages: {
      throw:
        "throw is forbidden in Craft code because it bypasses Craft's typed exception channel and resource exception state. Return craftException({ code: '{{code}}' }, ...) for expected or domain failures; keep technical throws inside an explicit adapter boundary.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    let importFixClaimed = false;

    return {
      ThrowStatement(node) {
        const report = {
          node,
          messageId: 'throw',
          data: { code: DEFAULT_EXCEPTION_CODE },
        };

        if (canReturnFrom(node)) {
          report.fix = (fixer) => {
            const fixes = [
              fixer.replaceText(node, toCraftExceptionReturn(node, sourceCode)),
            ];

            if (
              !hasCraftExceptionBinding(node, sourceCode) &&
              !importFixClaimed
            ) {
              importFixClaimed = true;
              fixes.push(createImportFix(fixer, sourceCode));
            }

            return fixes;
          };
        }

        context.report(report);
      },
    };
  },
};

function canReturnFrom(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'StaticBlock' || current.type === 'Program') {
      return false;
    }

    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function toCraftExceptionReturn(node, sourceCode) {
  if (!node.argument) {
    return `return craftException({ code: '${DEFAULT_EXCEPTION_CODE}' });`;
  }

  return `return craftException({ code: '${DEFAULT_EXCEPTION_CODE}' }, { error: ${sourceCode.getText(node.argument)} });`;
}

function hasCraftExceptionBinding(node, sourceCode) {
  let scope = sourceCode.getScope(node);
  while (scope) {
    const variable = scope.variables.find(
      (candidate) => candidate.name === CRAFT_EXCEPTION_NAME,
    );
    if (variable) {
      return variable.defs.some((definition) => {
        if (definition.type !== 'ImportBinding') return true;
        return (
          definition.node.importKind !== 'type' &&
          definition.parent?.importKind !== 'type'
        );
      });
    }
    scope = scope.upper;
  }

  return false;
}

function createImportFix(fixer, sourceCode) {
  const coreImport = sourceCode.ast.body.find(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.importKind !== 'type' &&
      statement.source.value === CORE_MODULE,
  );

  if (
    coreImport &&
    coreImport.specifiers.some(
      (specifier) =>
        specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type',
    )
  ) {
    const lastSpecifier = coreImport.specifiers.at(-1);
    return fixer.insertTextAfter(lastSpecifier, `, ${CRAFT_EXCEPTION_NAME}`);
  }

  const importText = `import { ${CRAFT_EXCEPTION_NAME} } from '${CORE_MODULE}';\n`;
  const firstImport = sourceCode.ast.body.find(
    (statement) => statement.type === 'ImportDeclaration',
  );
  return firstImport
    ? fixer.insertTextBefore(firstImport, importText)
    : fixer.insertTextBeforeRange([0, 0], importText);
}
