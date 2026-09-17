const FORBIDDEN = new Set([
  'craftToken',
  'CraftToken',
  'asAngularToken',
  'ɵregisterCraftTokenHostToken',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow the removed authored token architecture in core/component production sources.',
    },
    schema: [],
    messages: {
      forbidden:
        'Authored dependencies must use craftService helpers; the legacy token architecture is not allowed.',
    },
  },

  create(context) {
    const filename = context.getFilename().replaceAll('\\', '/');
    const isProductionSource =
      (filename.includes('/libs/core/src/') ||
        filename.includes('/libs/component/src/')) &&
      !filename.endsWith('.spec.ts') &&
      !filename.endsWith('.test.ts');
    if (!isProductionSource) return {};

    return {
      Identifier(node) {
        if (FORBIDDEN.has(node.name)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};
