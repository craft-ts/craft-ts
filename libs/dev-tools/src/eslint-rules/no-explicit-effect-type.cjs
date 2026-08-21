'use strict';

const EFFECT_PACKAGE = 'effect';

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer the type inferred by Effect.gen over an explicit Effect return annotation.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      explicit:
        'Effect.gen infers the complete Effect type. Remove this explicit type annotation.',
    },
  },

  create(context) {
    const effectBindings = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== EFFECT_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            effectBindings.add(specifier.local.name);
          } else if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'Effect'
          ) {
            effectBindings.add(specifier.local.name);
          }
        }
      },

      VariableDeclarator(node) {
        if (!node.id.typeAnnotation || !isEffectGenExpression(node.init)) {
          return;
        }

        report(node.id.typeAnnotation);
      },

      FunctionDeclaration(node) {
        if (node.returnType && hasDirectEffectGenReturn(node.body)) {
          report(node.returnType);
        }
      },

      ArrowFunctionExpression(node) {
        if (node.returnType && hasEffectGenBody(node.body)) {
          report(node.returnType);
        }
      },

      FunctionExpression(node) {
        if (node.returnType && hasEffectGenBody(node.body)) {
          report(node.returnType);
        }
      },
    };

    function report(annotation) {
      context.report({
        node: annotation,
        messageId: 'explicit',
        fix(fixer) {
          return fixer.remove(annotation);
        },
      });
    }

    function hasEffectGenBody(body) {
      if (isEffectGenExpression(body)) return true;
      return body?.type === 'BlockStatement' && hasDirectEffectGenReturn(body);
    }

    function hasDirectEffectGenReturn(body) {
      return Boolean(
        body?.body?.some(
          (statement) =>
            statement.type === 'ReturnStatement' &&
            isEffectGenExpression(statement.argument),
        ),
      );
    }

    function isEffectGenExpression(node) {
      let current = unwrap(node);
      while (current?.type === 'CallExpression') {
        if (isEffectGenMember(current.callee)) return true;

        if (
          current.callee.type === 'MemberExpression' &&
          !current.callee.computed
        ) {
          current = unwrap(current.callee.object);
          continue;
        }

        return false;
      }
      return false;
    }

    function isEffectGenMember(node) {
      return (
        node?.type === 'MemberExpression' &&
        !node.computed &&
        node.property.type === 'Identifier' &&
        node.property.name === 'gen' &&
        node.object.type === 'Identifier' &&
        effectBindings.has(node.object.name)
      );
    }
  },
};

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'].includes(
      current.type,
    )
  ) {
    current = current.expression;
  }
  return current;
}
