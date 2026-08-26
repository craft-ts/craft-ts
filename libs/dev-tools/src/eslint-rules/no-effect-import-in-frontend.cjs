'use strict';

const EFFECT_IMPORT_PREFIXES = [
  'effect',
  '@effect/',
  '@craft-ts/effect',
  '@craft-ts/i18n-effect',
];

function isEffectImport(source) {
  return EFFECT_IMPORT_PREFIXES.some(
    (prefix) => prefix.endsWith('/')
      ? source.startsWith(prefix)
      : source === prefix || source.startsWith(prefix + '/'),
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent EffectTS imports from crossing into a plain frontend boundary.',
    },
    schema: [],
    messages: {
      forbidden:
        'EffectTS imports are not allowed in the plain frontend. Keep EffectTS in server files or choose the Effect frontend runtime.',
    },
  },

  create(context) {
    const reportIfEffectImport = (node) => {
      const source = node.source?.value;
      if (typeof source === 'string' && isEffectImport(source)) {
        context.report({ node: node.source, messageId: 'forbidden' });
      }
    };

    return {
      ImportDeclaration: reportIfEffectImport,
      ExportAllDeclaration: reportIfEffectImport,
      ExportNamedDeclaration: reportIfEffectImport,
      ImportExpression(node) {
        const source = node.source;
        if (source?.type === 'Literal' && typeof source.value === 'string' && isEffectImport(source.value)) {
          context.report({ node: source, messageId: 'forbidden' });
        }
      },
    };
  },
};
