const TEMPORAL_GLOBALS = new Set([
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct timer globals in Craft modules in favour of the Craft temporal runtime.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? '';
    const implementationFile =
      /(?:^|[/\\])temporal-runtime\.[cm]?[jt]sx?$/.test(filename);

    function isGlobalReference(node) {
      let scope = sourceCode.getScope(node);
      while (scope) {
        const reference = scope.references.find(
          (candidate) => candidate.identifier === node,
        );
        if (reference) {
          return (
            reference.resolved == null || reference.resolved.defs.length === 0
          );
        }
        scope = scope.upper;
      }
      return false;
    }

    function report(node, name) {
      context.report({
        node,
        message: `Direct ${name}(...) is forbidden in Craft modules. Use the Craft temporal runtime instead.`,
      });
    }

    return {
      Identifier(node) {
        if (
          implementationFile ||
          !TEMPORAL_GLOBALS.has(node.name) ||
          !isGlobalReference(node)
        ) {
          return;
        }
        report(node, node.name);
      },
      MemberExpression(node) {
        if (
          implementationFile ||
          node.computed ||
          node.object.type !== 'Identifier' ||
          node.object.name !== 'globalThis' ||
          node.property.type !== 'Identifier' ||
          !TEMPORAL_GLOBALS.has(node.property.name) ||
          !isGlobalReference(node.object)
        ) {
          return;
        }
        report(node.property, node.property.name);
      },
    };
  },
};
