'use strict';

const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require exported functions that directly return Craft nodes to use craftComponent(...).',
    },
    schema: [],
    messages: {
      requireComponent:
        'Exported function "{{name}}" returns a Craft node directly. Wrap it in craftComponent(...) so Craft directives and composition can be applied.',
    },
  },

  create(context) {
    const functionsByName = new Map();
    const namesByFunction = new Map();
    const exportedNames = new Set();
    const exportedFunctions = new Set();
    const reportedFunctions = new Set();

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          functionsByName.set(node.id.name, node);
          namesByFunction.set(node, node.id.name);
        }
        if (node.parent.type === 'ExportDefaultDeclaration') {
          exportedFunctions.add(node);
        }
      },

      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && isFunction(node.init)) {
          functionsByName.set(node.id.name, node.init);
          namesByFunction.set(node.init, node.id.name);
        }
      },

      ExportNamedDeclaration(node) {
        if (node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration') {
            exportedFunctions.add(node.declaration);
          } else if (node.declaration.type === 'VariableDeclaration') {
            for (const declaration of node.declaration.declarations) {
              if (
                declaration.id.type === 'Identifier' &&
                isFunction(declaration.init)
              ) {
                exportedFunctions.add(declaration.init);
                namesByFunction.set(declaration.init, declaration.id.name);
              }
            }
          }
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ExportSpecifier') {
            const local = specifier.local;
            if (local?.type === 'Identifier') exportedNames.add(local.name);
          }
        }
      },

      ExportDefaultDeclaration(node) {
        const declaration = node.declaration;
        if (isFunction(declaration)) {
          exportedFunctions.add(declaration);
        } else if (declaration?.type === 'Identifier') {
          exportedNames.add(declaration.name);
        }
      },

      'Program:exit'() {
        for (const name of exportedNames) {
          const functionNode = functionsByName.get(name);
          if (functionNode) exportedFunctions.add(functionNode);
        }

        for (const functionNode of exportedFunctions) {
          if (
            reportedFunctions.has(functionNode) ||
            !returnsCraftNodeDirectly(functionNode, context)
          ) {
            continue;
          }

          reportedFunctions.add(functionNode);
          context.report({
            node: functionNode.id ?? functionNode,
            messageId: 'requireComponent',
            data: {
              name: functionName(functionNode, namesByFunction),
            },
          });
        }
      },
    };
  },
};

function returnsCraftNodeDirectly(functionNode, context) {
  if (functionNode.type === 'ArrowFunctionExpression') {
    if (functionNode.body.type !== 'BlockStatement') {
      return isCraftNodeCall(unwrap(functionNode.body));
    }
  }

  if (functionNode.body.type !== 'BlockStatement') return false;

  let result = false;
  walk(
    functionNode.body,
    context.sourceCode ?? context.getSourceCode(),
    (node) => {
      if (node !== functionNode.body && isFunction(node)) return 'skip';
      if (
        node.type === 'ReturnStatement' &&
        isCraftNodeCall(unwrap(node.argument))
      ) {
        result = true;
      }
    },
  );
  return result;
}

function isCraftNodeCall(node) {
  return Boolean(parseHyperscriptCall(node));
}

function isFunction(node) {
  return Boolean(
    node &&
      (node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression'),
  );
}

function functionName(node, namesByFunction) {
  if (node.id?.type === 'Identifier') return node.id.name;
  if (namesByFunction.has(node)) return namesByFunction.get(node);
  return 'default export';
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function walk(node, sourceCode, visit) {
  if (!node || typeof node.type !== 'string') return;
  const result = visit(node);
  if (result === 'skip') return;

  const keys = sourceCode.visitorKeys[node.type] ?? [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, sourceCode, visit);
    } else {
      walk(child, sourceCode, visit);
    }
  }
}
