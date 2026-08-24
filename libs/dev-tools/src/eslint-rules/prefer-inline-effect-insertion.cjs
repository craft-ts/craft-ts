'use strict';

const EFFECT_PACKAGE = '@craft-ts/effect';

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Keep queryEffect insertion callbacks inline so their types are inferred.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      inline:
        'Keep the queryEffect insertion callback inline and let its types be inferred; do not extract a typed helper.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const queryEffectBindings = new Set();
    const visitorKeys = sourceCode.visitorKeys ?? {};

    return {
      ImportDeclaration(node) {
        if (node.source.value !== EFFECT_PACKAGE) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'queryEffect'
          ) {
            queryEffectBindings.add(specifier.local.name);
          }
        }
      },

      'Program:exit'(program) {
        walk(program, (node) => {
          if (
            node.type !== 'CallExpression' ||
            node.callee.type !== 'Identifier' ||
            !queryEffectBindings.has(node.callee.name)
          ) {
            return;
          }

          const insertion = node.arguments[2];
          if (!insertion || insertion.type !== 'Identifier') return;

          const helper = findInsertionHelper(program, insertion.name);
          if (!helper) return;

          const callback = helper.init;
          const callbackText = withoutParameterType(callback, sourceCode);
          const fixes = [
            fixerReplace(sourceCode, insertion, callbackText),
            removeDeclaration(helper),
          ];

          const typeName = getParameterTypeName(callback);
          const typeAlias = typeName && findTypeAlias(program, typeName);
          if (
            typeAlias &&
            !hasOtherReference(program, typeName, [
              typeAlias,
              callback.params[0]?.typeAnnotation,
            ])
          ) {
            fixes.push(removeDeclaration(typeAlias));

            const insertionParamsImport = findImportSpecifier(
              program,
              'InsertionParams',
            );
            if (
              insertionParamsImport &&
              !hasOtherReference(program, 'InsertionParams', [
                typeAlias,
                insertionParamsImport,
              ])
            ) {
              fixes.push(removeImportSpecifier(insertionParamsImport));
            }
          }

          context.report({
            node: insertion,
            messageId: 'inline',
            fix(fixer) {
              return fixes.map((fix) => fix(fixer));
            },
          });
        }, visitorKeys);
      },
    };

    function fixerReplace(_sourceCode, node, text) {
      return (fixer) => fixer.replaceText(node, text);
    }

    function removeDeclaration(node) {
      return (fixer) => {
        const declaration = node.parent;
        if (declaration.type === 'TSTypeAliasDeclaration') {
          const container = declaration.parent;
          return container.type === 'ExportNamedDeclaration'
            ? fixer.remove(container)
            : fixer.remove(declaration);
        }

        if (declaration.type !== 'VariableDeclaration') {
          return fixer.remove(node);
        }

        const statement =
          declaration.parent.type === 'ExportNamedDeclaration'
            ? declaration.parent
            : declaration;
        if (
          declaration.declarations.length === 1
        ) {
          return fixer.remove(statement);
        }

        const index = declaration.declarations.indexOf(node);
        const next = declaration.declarations[index + 1];
        const previous = declaration.declarations[index - 1];
        return next
          ? fixer.removeRange([node.range[0], next.range[0]])
          : fixer.removeRange([previous.range[1], node.range[1]]);
      };
    }

    function removeImportSpecifier(specifier) {
      return (fixer) => {
        const declaration = specifier.parent;
        if (declaration.specifiers.length === 1) {
          return fixer.remove(declaration);
        }

        const index = declaration.specifiers.indexOf(specifier);
        const next = declaration.specifiers[index + 1];
        const previous = declaration.specifiers[index - 1];
        return next
          ? fixer.removeRange([specifier.range[0], next.range[0]])
          : fixer.removeRange([previous.range[1], specifier.range[1]]);
      };
    }

    function findInsertionHelper(program, name) {
      let result;
      walk(program, (node) => {
        if (
          result ||
          node.type !== 'VariableDeclarator' ||
          node.id.type !== 'Identifier' ||
          node.id.name !== name ||
          !isFunction(node.init)
        ) {
          return;
        }
        result = node;
      }, visitorKeys);
      return result;
    }

    function findTypeAlias(program, name) {
      let result;
      walk(program, (node) => {
        if (
          !result &&
          node.type === 'TSTypeAliasDeclaration' &&
          node.id.name === name
        ) {
          result = node;
        }
      }, visitorKeys);
      return result;
    }

    function findImportSpecifier(program, name) {
      let result;
      walk(program, (node) => {
        if (
          !result &&
          node.type === 'ImportSpecifier' &&
          getIdentifierName(node.imported) === name
        ) {
          result = node;
        }
      }, visitorKeys);
      return result;
    }

    function hasOtherReference(program, name, excluded) {
      let found = false;
      walk(program, (node) => {
        if (
          !found &&
          node.type === 'Identifier' &&
          node.name === name &&
          !excluded.some((parent) => parent && isDescendant(node, parent))
        ) {
          found = true;
        }
      }, visitorKeys);
      return found;
    }

    function isDescendant(node, ancestor) {
      let current = node;
      while (current) {
        if (current === ancestor) return true;
        current = current.parent;
      }
      return false;
    }
  },
};

function getParameterTypeName(callback) {
  const annotation = callback.params[0]?.typeAnnotation;
  const typeName = annotation?.typeAnnotation;
  return typeName?.type === 'TSTypeReference' &&
    typeName.typeName.type === 'Identifier'
    ? typeName.typeName.name
    : undefined;
}

function withoutParameterType(callback, sourceCode) {
  const text = sourceCode.getText(callback);
  const annotation = callback.params[0]?.typeAnnotation;
  if (!annotation) return text;

  const start = annotation.range[0] - callback.range[0];
  const end = annotation.range[1] - callback.range[0];
  return text.slice(0, start) + text.slice(end);
}

function isFunction(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
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
