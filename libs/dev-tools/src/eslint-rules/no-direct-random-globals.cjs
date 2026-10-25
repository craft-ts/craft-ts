const RANDOM_MEMBERS = new Set(['randomUUID', 'getRandomValues']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct random globals in Craft modules in favour of the Craft random runtime.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? '';
    const implementationFile =
      /(?:^|[/\\])craft-random-runtime\.[cm]?[jt]sx?$/.test(filename);

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

    function propertyName(node) {
      if (!node.computed && node.property.type === 'Identifier') {
        return node.property.name;
      }
      if (node.computed && node.property.type === 'Literal') {
        return String(node.property.value);
      }
      return undefined;
    }

    function isRoot(node, name) {
      return node.type === 'Identifier'
        ? node.name === name && isGlobalReference(node)
        : node.type === 'MemberExpression' &&
            propertyName(node) === name &&
            node.object.type === 'Identifier' &&
            node.object.name === 'globalThis' &&
            isGlobalReference(node.object);
    }

    function randomMember(node) {
      if (node.type !== 'MemberExpression') return undefined;
      const property = propertyName(node);
      if (property === 'random' && isRoot(node.object, 'Math')) return property;
      if (RANDOM_MEMBERS.has(property) && isRoot(node.object, 'crypto')) {
        return property;
      }
      if (node.object.type === 'MemberExpression') {
        const rootProperty = propertyName(node.object);
        if (
          rootProperty === 'Math' &&
          isRoot(node.object.object, 'globalThis') &&
          property === 'random'
        )
          return property;
        if (
          rootProperty === 'crypto' &&
          isRoot(node.object.object, 'globalThis') &&
          RANDOM_MEMBERS.has(property)
        )
          return property;
      }
      return undefined;
    }

    return {
      MemberExpression(node) {
        if (implementationFile) return;
        const property = randomMember(node);
        if (!property) return;
        context.report({
          node,
          message: `Direct ${property} randomness is forbidden in Craft modules. Use CraftRandomRuntime instead.`,
        });
      },
    };
  },
};
