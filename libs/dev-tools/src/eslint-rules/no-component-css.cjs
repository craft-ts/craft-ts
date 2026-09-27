'use strict';

const { metaObjectsOf, propertyNamed } = require('./style-binding-utils.cjs');

/**
 * No CSS reaches a component except through `@craft-ts/style`.
 *
 * `meta.styles`, `meta.stylesUrl` and `meta.contentStyles` carry CSS text the
 * design system never sees: no axis, no contrast proof, no graph edge. A `.css`
 * import is the same text arriving from a file. The only stylesheet an app
 * imports is the one the build emits, `virtual:craft-style.css`.
 *
 * The fields still exist — the bypass has to stay *possible*, for a third-party
 * widget that ships its own CSS — but taking it is an
 * `eslint-disable-next-line craft-ts/no-component-css -- reason`, which Review
 * Attest lists for a decision.
 *
 * `<link rel="stylesheet">` in `index.html` is not ESLint's to see; the
 * `no-global-stylesheet` architecture rule covers it.
 */
const EMITTED_SHEET = 'virtual:craft-style.css';
const CSS_IMPORT = /\.css(\?.*)?$/;
const META_CSS_FIELDS = ['styles', 'stylesUrl', 'contentStyles'];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid component CSS outside @craft-ts/style: meta.styles/stylesUrl/contentStyles and .css imports.',
    },
    schema: [],
    messages: {
      metaCss:
        '`{{field}}` puts CSS text on the component, outside the design system: no axis, no contrast proof, no graph edge sees it. Write the rules in a *.style.ts sheet (craftStyles) and bind the class with `class:`.',
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
      CallExpression(node) {
        for (const meta of metaObjectsOf(node)) {
          for (const field of META_CSS_FIELDS) {
            const entry = propertyNamed(meta, field);
            if (entry) {
              context.report({
                node: entry.key,
                messageId: 'metaCss',
                data: { field: `meta.${field}` },
              });
            }
          }
        }
      },
    };
  },
};
