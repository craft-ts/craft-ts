module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Destructure a value directly from yield* when its temporary is only used for that destructuring.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferDirect:
        'Destructure directly from this yield* expression; the temporary is only used by this destructuring.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      VariableDeclaration(node) {
        if (
          node.kind !== 'const' ||
          node.declarations.length !== 1 ||
          node.declarations[0].id.type !== 'Identifier' ||
          node.declarations[0].id.typeAnnotation ||
          node.declarations[0].init?.type !== 'YieldExpression' ||
          !node.declarations[0].init.delegate
        ) {
          return;
        }

        const [temporary] = node.declarations;
        const reference = findOnlyReference(temporary);
        const destructuring = reference?.parent;
        if (
          !destructuring ||
          destructuring.type !== 'VariableDeclarator' ||
          destructuring.init !== reference ||
          destructuring.id.type !== 'ObjectPattern' ||
          destructuring.id.typeAnnotation ||
          destructuring.parent?.type !== 'VariableDeclaration' ||
          destructuring.parent.kind !== 'const' ||
          destructuring.parent.declarations.length !== 1
        ) {
          return;
        }

        context.report({
          node: destructuring,
          messageId: 'preferDirect',
          fix: canSafelyFixAdjacentPair(node, destructuring.parent)
            ? (fixer) =>
                inlineAdjacentPair(fixer, node, destructuring, temporary.init)
            : undefined,
        });
      },
    };

    function findOnlyReference(temporary) {
      const variables = sourceCode.scopeManager?.scopes.flatMap(
        (scope) => scope.variables,
      );
      const variable = variables?.find((candidate) =>
        candidate.defs.some((definition) => definition.node === temporary),
      );

      return variable?.references.length === 1
        ? variable.references[0].identifier
        : undefined;
    }

    function canSafelyFixAdjacentPair(temporaryDeclaration, useDeclaration) {
      return (
        getPreviousStatement(useDeclaration) === temporaryDeclaration &&
        !sourceCode.getAllComments().some(
          (comment) =>
            comment.range[0] >= temporaryDeclaration.range[0] &&
            comment.range[1] <= useDeclaration.range[0],
        )
      );
    }

    function inlineAdjacentPair(
      fixer,
      temporaryDeclaration,
      destructuring,
      init,
    ) {
      const useDeclaration = destructuring.parent;
      const replacement =
        sourceCode.text.slice(
          useDeclaration.range[0],
          destructuring.init.range[0],
        ) +
        sourceCode.getText(init) +
        sourceCode.text.slice(
          destructuring.init.range[1],
          useDeclaration.range[1],
        );

      return fixer.replaceTextRange(
        [temporaryDeclaration.range[0], useDeclaration.range[1]],
        replacement,
      );
    }

    function getPreviousStatement(node) {
      const parent = node.parent;
      const statements =
        Array.isArray(parent?.body) && parent.body.includes(node)
          ? parent.body
          : parent?.type === 'SwitchCase'
            ? parent.consequent
            : undefined;
      if (!statements) return undefined;

      const index = statements.indexOf(node);
      return index > 0 ? statements[index - 1] : undefined;
    }
  },
};
