'use strict';

const { componentInfo } = require('./css-rule-utils.cjs');

const INTERACTIVE_SELECTOR = /(^|[\s,>+~])(button|a|input|select|textarea|\[tabindex\b)/i;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require :focus-visible (or :focus) when a component styles interactive elements.',
    },
    schema: [],
    messages: {
      missing:
        'Component styles target {{selector}} but never define :focus-visible or :focus.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        const info = componentInfo(context, sourceCode, node);
        if (!info?.css) return;
        if (!INTERACTIVE_SELECTOR.test(info.css)) return;
        if (/:focus-visible|:focus\b/.test(info.css)) return;
        context.report({
          node: info.styles?.value ?? info.stylesUrl.value,
          messageId: 'missing',
          data: { selector: 'button/a/input/[tabindex]' },
        });
      },
    };
  },
};
