'use strict';

/**
 * No CSS reaches a component except through `@craft-ts/style`.
 *
 * A `.css` import is CSS text the design system never sees: no axis, no
 * contrast proof, no graph edge. The only stylesheet an app imports is the one
 * the build emits, `virtual:craft-style.css`.
 *
 * Taking the bypass is an `eslint-disable-next-line craft-ts/no-component-css
 * -- reason`, which Review Attest lists for a decision.
 *
 * `<link rel="stylesheet">` in `index.html` is not ESLint's to see; the
 * `no-global-stylesheet` architecture rule covers it.
 */
const EMITTED_SHEET = 'virtual:craft-style.css';
const CSS_IMPORT = /\.css(\?.*)?$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid CSS outside @craft-ts/style: every .css import except the emitted sheet.',
    },
    schema: [],
    messages: {
      cssImport:
        "'{{source}}' imports CSS outside the design system. The only stylesheet an app imports is '" +
        EMITTED_SHEET +
        "', which the build emits from the *.style.ts sheets. Global rules belong in craftGlobalStyles, fonts in defineFont.",
    },
  },
  create(context) {
    const checkSource = (node, source) => {
      if (typeof source !== 'string' || source === EMITTED_SHEET) return;
      if (!CSS_IMPORT.test(source)) return;
      context.report({ node, messageId: 'cssImport', data: { source } });
    };

    return {
      ImportDeclaration(node) {
        checkSource(node.source, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          checkSource(node.source, node.source.value);
        }
      },
    };
  },
};
