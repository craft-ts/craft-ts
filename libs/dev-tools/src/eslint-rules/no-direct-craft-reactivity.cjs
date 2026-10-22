const FORBIDDEN_IMPORTS = new Set(['craftSignal', 'ɵcomputed']);

function importedName(specifier) {
  const imported = specifier.imported;
  return imported?.name ?? imported?.value;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Craft state and computed primitives instead of importing low-level signal factories from the public core entry point.',
      url: 'https://craft-ts.github.io/craft/guide/routing/eslint-rules',
    },
    schema: [],
    messages: {
      useCraftPrimitives:
        '`{{name}}` is a low-level reactive factory and bypasses Craft state/computed mechanisms. Use `state(...)` for writable state and `craftComputed(...)` for derived values.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            !FORBIDDEN_IMPORTS.has(importedName(specifier))
          ) {
            continue;
          }

          context.report({
            node: specifier,
            messageId: 'useCraftPrimitives',
            data: { name: importedName(specifier) },
          });
        }
      },
    };
  },
};
