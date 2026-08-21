'use strict';

const COMPONENT_PACKAGE = '@craft-ts/component';

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer inlining route providers that are used only once by loadCraftComponent.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      inline:
        'Inline this route provider tuple in loadCraftComponent(...); it is only used once.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const loadCraftComponentBindings = new Set();
    const visitorKeys = sourceCode.visitorKeys ?? {};

    return {
      ImportDeclaration(node) {
        if (node.source.value !== COMPONENT_PACKAGE) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'loadCraftComponent'
          ) {
            loadCraftComponentBindings.add(specifier.local.name);
          }
        }
      },

      'Program:exit'(program) {
        walk(program, (node) => {
          if (node.type !== 'VariableDeclarator') return;
          if (
            node.id.type !== 'Identifier' ||
            !isProviderArray(node.init)
          ) {
            return;
          }

          const references = findReferences(program, node.id.name, node);
          if (references.length !== 1) return;

          const reference = references[0];
          const call = reference.parent;
          if (
            call?.type !== 'CallExpression' ||
            call.arguments[1] !== reference ||
            call.callee.type !== 'Identifier' ||
            !loadCraftComponentBindings.has(call.callee.name)
          ) {
            return;
          }

          context.report({
            node: reference,
            messageId: 'inline',
            fix(fixer) {
              return [
                fixer.replaceText(reference, sourceCode.getText(node.init)),
                removeDeclaration(fixer, node),
              ];
            },
          });
        }, visitorKeys);
      },
    };

    function findReferences(program, name, declaration) {
      const references = [];
      walk(program, (node) => {
        if (
          node.type === 'Identifier' &&
          node.name === name &&
          node !== declaration.id
        ) {
          references.push(node);
        }
      }, visitorKeys);
      return references;
    }
  },
};

function isProviderArray(node) {
  let current = node;
  while (
    current &&
    ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'].includes(
      current.type,
    )
  ) {
    current = current.expression;
  }
  return current?.type === 'ArrayExpression';
}

function removeDeclaration(fixer, node) {
  const declaration = node.parent;
  if (declaration.type !== 'VariableDeclaration') {
    return fixer.remove(node);
  }

  if (declaration.declarations.length === 1) {
    return fixer.remove(declaration);
  }

  const index = declaration.declarations.indexOf(node);
  const next = declaration.declarations[index + 1];
  const previous = declaration.declarations[index - 1];
  return next
    ? fixer.removeRange([node.range[0], next.range[0]])
    : fixer.removeRange([previous.range[1], node.range[1]]);
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function walk(node, visit, visitorKeys) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of visitorKeys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => walk(item, visit, visitorKeys));
    } else {
      walk(child, visit, visitorKeys);
    }
  }
}
